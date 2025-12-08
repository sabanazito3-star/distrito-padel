// server.js - Distrito Padel v5.0 con Sistema de Configuración
import dotenv from 'dotenv';
dotenv.config();

import express from 'express';
import bodyParser from 'body-parser';
import cors from 'cors';
import nodemailer from 'nodemailer';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

function loadData() {
  try { return JSON.parse(fs.readFileSync(DATA_FILE, 'utf8')); }
  catch (e) { return { usuarios: {}, sessions: {}, reservas: [], promociones: [], bloqueos: [] }; }
}

function saveData(db) {
  fs.writeFileSync(DATA_FILE, JSON.stringify(db, null, 2));
}

// CARGAR CONFIGURACIÓN
function loadConfig() {
  try {
    return JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8'));
  } catch (e) {
    console.warn('config.json no encontrado, usando valores por defecto');
    return {
      precios: {
        horaDia: 250,
        horaNoche: 400,
        cambioTarifa: 16
      },
      sistema: {
        numCanchas: 3,
        limiteReservasDias: 7,
        horaApertura: 8,
        horaCierre: 24
      }
    };
  }
}

function saveConfig(config) {
  fs.writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2));
}

const db = loadData();
const config = loadConfig();

const app = express();
app.use(bodyParser.json());
app.use(cors());
app.use(express.static(path.join(__dirname, 'public')));

const EMAIL_USER = process.env.EMAIL_USER || '';
const EMAIL_PASS = process.env.EMAIL_PASS || '';
const ADMIN_TOKEN = process.env.ADMIN_TOKEN || 'distrito_admin_2025';
const BASE_URL = process.env.BASE_URL || 'http://localhost:3000';

const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: { user: EMAIL_USER, pass: EMAIL_PASS }
});

async function trySendMail(to, subject, text, html) {
  if (!EMAIL_USER || !EMAIL_PASS) {
    console.log('DEV MODE - Email no enviado:', { to, subject });
    return;
  }
  return transporter.sendMail({ from: 'Distrito Padel <' + EMAIL_USER + '>', to, subject, text, html });
}

function hashPassword(password) {
  return crypto.createHash('sha256').update(password).digest('hex');
}

function convertirA12h(hora24) {
  const [h, m] = hora24.split(':').map(Number);
  const periodo = h >= 12 ? 'PM' : 'AM';
  const hora12 = h === 0 ? 12 : h > 12 ? h - 12 : h;
  return `${hora12}:${m.toString().padStart(2, '0')} ${periodo}`;
}

function convertirA24h(hora12) {
  const match = hora12.match(/(\d+):(\d+)\s*(AM|PM)/i);
  if (!match) return hora12;
  let [, h, m, periodo] = match;
  h = parseInt(h); m = parseInt(m);
  if (periodo.toUpperCase() === 'PM' && h !== 12) h += 12;
  if (periodo.toUpperCase() === 'AM' && h === 12) h = 0;
  return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}`;
}

function validarVentanaReserva(fecha) {
  const hoy = new Date();
  hoy.setHours(0, 0, 0, 0);

  const [year, month, day] = fecha.split('-').map(Number);
  const fechaReserva = new Date(year, month - 1, day);
  fechaReserva.setHours(0, 0, 0, 0);

  const diffTime = fechaReserva - hoy;
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

  if (diffDays < 0) return { ok: false, msg: 'No puedes reservar fechas pasadas' };
  if (diffDays > 7) return { ok: false, msg: 'Solo puedes reservar con máximo 7 días de anticipación' };
  
  return { ok: true };
}

function obtenerDescuentoConHora(fecha, hora) {
  const horaMinutos = hhmmToMinutes(hora);
  const promo = db.promociones.find(p => {
    if (!p.activa) return false;
    if (p.fecha && p.fecha !== fecha) return false;
    if (p.horaInicio && p.horaFin) {
      const inicioPromo = hhmmToMinutes(p.horaInicio);
      const finPromo = hhmmToMinutes(p.horaFin);
      return horaMinutos >= inicioPromo && horaMinutos < finPromo;
    }
    if (p.fecha && !p.horaInicio && !p.horaFin) return true;
    return false;
  });
  return promo ? promo.descuento : 0;
}

function calcularPrecio(hora, duracion, fecha) {
  const [h, m] = hora.split(':').map(Number);
  const inicioMinutos = h * 60 + m;
  const finMinutos = inicioMinutos + (duracion * 60);
  
  const CAMBIO_TARIFA = config.precios.cambioTarifa * 60;
  const PRECIO_DIA = config.precios.horaDia;
  const PRECIO_NOCHE = config.precios.horaNoche;
  
  let precioBase = 0;
  
  if (finMinutos <= CAMBIO_TARIFA) {
    precioBase = PRECIO_DIA * duracion;
  } else if (inicioMinutos >= CAMBIO_TARIFA) {
    precioBase = PRECIO_NOCHE * duracion;
  } else {
    const minutosAntesDe4pm = CAMBIO_TARIFA - inicioMinutos;
    const horasAntesDe4pm = minutosAntesDe4pm / 60;
    const minutosDespuesDe4pm = finMinutos - CAMBIO_TARIFA;
    const horasDespuesDe4pm = minutosDespuesDe4pm / 60;
    precioBase = (horasAntesDe4pm * PRECIO_DIA) + (horasDespuesDe4pm * PRECIO_NOCHE);
  }
  
  const descuento = obtenerDescuentoConHora(fecha, hora);
  const precioFinal = precioBase * (1 - descuento / 100);
  
  return {
    precioBase: Math.round(precioBase),
    descuento,
    precioFinal: Math.round(precioFinal)
  };
}

function hhmmToMinutes(hhmm) {
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + m;
}

function hayBloqueo(cancha, fecha, inicioMin, durMin) {
  const finMin = inicioMin + durMin;
  return db.bloqueos.some(b => {
    if (b.fecha !== fecha) return false;
    if (b.cancha && String(b.cancha) !== String(cancha)) return false;
    if (!b.horaInicio && !b.horaFin) return true;
    if (b.horaInicio && b.horaFin) {
      const bInicio = hhmmToMinutes(b.horaInicio);
      const bFin = hhmmToMinutes(b.horaFin);
      return inicioMin < bFin && bInicio < finMin;
    }
    return false;
  });
}

function haySolapamiento(cancha, fecha, inicioMin, durMin, excludeId = null) {
  const finMin = inicioMin + durMin;
  return db.reservas.some(r => {
    if (excludeId && r.id === excludeId) return false;
    if (String(r.cancha) !== String(cancha)) return false;
    if (r.fecha !== fecha) return false;
    
    // Ignorar reservas canceladas
    if (r.estado === 'cancelada') return false;
    
    const rInicio = hhmmToMinutes(r.horaInicio);
    const rFin = rInicio + Number(r.duracion) * 60;
    return inicioMin < rFin && rInicio < finMin;
  });
}

function esFechaHoraPasada(fecha, hora) {
  const [year, month, day] = fecha.split('-').map(Number);
  const [h, m] = hora.split(':').map(Number);
  const fechaHoraReserva = new Date(year, month - 1, day, h, m, 0);
  const ahora = new Date();
  return fechaHoraReserva.getTime() < (ahora.getTime() - 5 * 60 * 1000);
}

// ============ AUTH ============
app.post('/api/auth/register', async (req, res) => {
  const { email, password, nombre, telefono } = req.body;

  if (!email || !password || !nombre || !telefono) {
    return res.status(400).json({ ok: false, msg: 'Todos los campos son requeridos' });
  }

  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(email)) {
    return res.status(400).json({ ok: false, msg: 'Email inválido. Ejemplo: juan@gmail.com' });
  }

  const telLimpio = telefono.replace(/\D/g, '');
  if (telLimpio.length !== 10) {
    return res.status(400).json({ ok: false, msg: 'El teléfono debe tener 10 dígitos' });
  }

  if (db.usuarios[email]) {
    return res.status(400).json({ ok: false, msg: 'Este email ya está registrado' });
  }

  db.usuarios[email] = { email, passwordHash: hashPassword(password), nombre, telefono, createdAt: new Date().toISOString() };
  saveData(db);

  const sessionToken = nanoid();
  db.sessions[sessionToken] = { email, created: Date.now() };
  saveData(db);

  await trySendMail(email, 'Bienvenido a Distrito Padel',
    `Hola ${nombre}, tu cuenta ha sido creada exitosamente.`,
    `<h2>Hola <strong>${nombre}</strong>,</h2><p>Tu cuenta ha sido creada exitosamente.</p>`);

  res.json({ ok: true, token: sessionToken, email, nombre });
});

app.post('/api/auth/login', (req, res) => {
  const { email, password } = req.body;
  const user = db.usuarios[email];
  if (!user || user.passwordHash !== hashPassword(password)) {
    return res.status(401).json({ ok: false, msg: 'Credenciales incorrectas' });
  }
  const sessionToken = nanoid();
  db.sessions[sessionToken] = { email, created: Date.now() };
  saveData(db);
  res.json({ ok: true, token: sessionToken, email, nombre: user.nombre });
});

// ============ RESERVAS ============
app.post('/api/reservas/crear', async (req, res) => {
  const { token, fecha, hora, duracion, cancha } = req.body;
  const session = db.sessions[token];
  if (!session) return res.status(401).json({ ok: false, msg: 'Sesión inválida' });

  const validacion = validarVentanaReserva(fecha);
  if (!validacion.ok) return res.status(400).json(validacion);

  if (esFechaHoraPasada(fecha, hora)) {
    return res.status(400).json({ ok: false, msg: 'No puedes reservar en el pasado' });
  }

  const [horaNum] = hora.split(':').map(Number);
  if (horaNum + Number(duracion) > 24) {
    return res.status(400).json({ ok: false, msg: 'El club cierra a las 12:00 AM' });
  }

  const inicioMin = hhmmToMinutes(hora);
  const durMin = Number(duracion) * 60;

  if (hayBloqueo(cancha, fecha, inicioMin, durMin)) {
    return res.status(400).json({ ok: false, msg: 'Horario bloqueado' });
  }

  if (haySolapamiento(cancha, fecha, inicioMin, durMin)) {
    return res.status(400).json({ ok: false, msg: 'Ya existe una reserva en ese horario' });
  }

  const precioInfo = calcularPrecio(hora, duracion, fecha);
  const reserva = {
    id: nanoid(),
    email: session.email,
    nombre: db.usuarios[session.email].nombre,
    telefono: db.usuarios[session.email].telefono,
    cancha: String(cancha),
    fecha,
    horaInicio: hora,
    duracion: Number(duracion),
    precioBase: precioInfo.precioBase,
    descuento: precioInfo.descuento,
    precio: precioInfo.precioFinal,
    pagado: false,
    creada: new Date().toISOString(),
    estado: 'confirmada'
  };

  db.reservas.push(reserva);
  saveData(db);

  const hora12 = convertirA12h(hora);
  await trySendMail(db.usuarios[session.email].email, 'Reserva confirmada', 'Reserva creada',
    `Fecha: ${fecha}, Hora: ${hora12}, Cancha: ${cancha}, Total: $${precioInfo.precioFinal}`);

  res.json({ ok: true, msg: 'Reserva creada', reserva });
});

app.get('/api/reservas', (req, res) => {
  const { fecha } = req.query;
  if (!fecha) return res.json(db.reservas);
  res.json(db.reservas.filter(r => r.fecha === fecha));
});

app.get('/api/mis-reservas', (req, res) => {
  const token = req.headers['x-session-token'];
  const session = db.sessions[token];
  if (!session) return res.status(401).json({ ok: false, msg: 'Sesión inválida' });
  res.json(db.reservas.filter(r => r.email === session.email && r.estado !== 'cancelada'));
});

// CANCELAR RESERVA (Usuario) - No elimina, solo marca como cancelada
app.delete('/api/reservas/:id', async (req, res) => {
  const token = req.headers['x-session-token'] || req.body.token;
  const session = db.sessions[token];
  if (!session) return res.status(401).json({ ok: false, msg: 'Sesión inválida' });
  
  const idx = db.reservas.findIndex(r => r.id === req.params.id && r.email === session.email);
  if (idx === -1) return res.status(404).json({ ok: false, msg: 'Reserva no encontrada' });
  
  // No eliminar, solo cambiar estado
  db.reservas[idx].estado = 'cancelada';
  db.reservas[idx].canceladaPor = 'usuario';
  db.reservas[idx].fechaCancelacion = new Date().toISOString();
  
  saveData(db);
  res.json({ ok: true, msg: 'Reserva cancelada' });
});

// ============ ADMIN: RESERVAS ============
app.get('/api/admin/reservas', (req, res) => {
  const token = req.headers['x-admin-token'];
  if (token !== ADMIN_TOKEN) return res.status(403).json({ error: 'Unauthorized' });
  res.json(db.reservas);
});

app.post('/api/admin/reservas/crear', async (req, res) => {
  const token = req.headers['x-admin-token'];
  if (token !== ADMIN_TOKEN) return res.status(403).json({ error: 'Unauthorized' });

  const { fecha, horaInicio, duracion, cancha, nombreCliente, telefonoCliente, emailCliente } = req.body;

  if (!fecha || !horaInicio || !duracion || !cancha || !nombreCliente) {
    return res.status(400).json({ error: 'Faltan datos' });
  }

  const hora24 = horaInicio.includes('M') ? convertirA24h(horaInicio) : horaInicio;
  const inicioMin = hhmmToMinutes(hora24);
  const durMin = Number(duracion) * 60;

  if (hayBloqueo(cancha, fecha, inicioMin, durMin)) {
    return res.status(400).json({ error: 'Horario bloqueado' });
  }

  if (haySolapamiento(cancha, fecha, inicioMin, durMin)) {
    return res.status(400).json({ error: 'Ya existe una reserva' });
  }

  const precioInfo = calcularPrecio(hora24, duracion, fecha);

  const reserva = {
    id: nanoid(),
    email: emailCliente || 'admin_manual',
    nombre: nombreCliente,
    telefono: telefonoCliente || '',
    cancha: String(cancha),
    fecha,
    horaInicio: hora24,
    duracion: Number(duracion),
    precioBase: precioInfo.precioBase,
    descuento: precioInfo.descuento,
    precio: precioInfo.precioFinal,
    pagado: false,
    esManual: true,
    creada: new Date().toISOString(),
    estado: 'confirmada'
  };

  db.reservas.push(reserva);
  saveData(db);

  res.json({ ok: true, reserva });
});

// CANCELAR RESERVA (Admin) - No elimina, solo marca como cancelada
app.delete('/api/admin/reservas/:id', (req, res) => {
  const token = req.headers['x-admin-token'];
  if (token !== ADMIN_TOKEN) return res.status(403).json({ error: 'Unauthorized' });
  
  const idx = db.reservas.findIndex(r => r.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: 'No encontrada' });
  
  // No eliminar, solo cambiar estado
  db.reservas[idx].estado = 'cancelada';
  db.reservas[idx].canceladaPor = 'admin';
  db.reservas[idx].fechaCancelacion = new Date().toISOString();
  
  saveData(db);
  res.json({ ok: true });
});

app.patch('/api/admin/reservas/:id/pago', (req, res) => {
  const token = req.headers['x-admin-token'];
  if (token !== ADMIN_TOKEN) return res.status(403).json({ error: 'Unauthorized' });
  const { pagado, metodoPago } = req.body;
  const idx = db.reservas.findIndex(r => r.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: 'No encontrada' });
  db.reservas[idx].pagado = pagado;
  if (metodoPago) db.reservas[idx].metodoPago = metodoPago;
  saveData(db);
  res.json({ ok: true, reserva: db.reservas[idx] });
});

// ============ REPORTE DE CIERRE ============
app.get('/api/admin/reporte-cierre', (req, res) => {
  const token = req.headers['x-admin-token'];
  if (token !== ADMIN_TOKEN) return res.status(403).json({ error: 'Unauthorized' });

  const { fecha, mes } = req.query;
  let reservasFiltradas = db.reservas.filter(r => r.pagado && r.estado !== 'cancelada');

  if (fecha) {
    reservasFiltradas = reservasFiltradas.filter(r => r.fecha === fecha);
  } else if (mes) {
    reservasFiltradas = reservasFiltradas.filter(r => r.fecha.startsWith(mes));
  }

  const totales = {
    efectivo: 0,
    tarjeta: 0,
    transferencia: 0,
    otro: 0,
    total: 0
  };

  reservasFiltradas.forEach(r => {
    const metodo = r.metodoPago || 'Otro';
    const precio = r.precio || 0;
    if (metodo === 'Efectivo') totales.efectivo += precio;
    else if (metodo === 'Tarjeta') totales.tarjeta += precio;
    else if (metodo === 'Transferencia') totales.transferencia += precio;
    else totales.otro += precio;
    totales.total += precio;
  });

  res.json({ reservas: reservasFiltradas, totales });
});

// ============ PROMOCIONES ============
app.get('/api/promociones', (req, res) => {
  const { fecha } = req.query;
  if (fecha) {
    const promo = db.promociones.find(p => p.fecha === fecha && p.activa);
    return res.json(promo || null);
  }
  res.json(db.promociones.filter(p => p.activa));
});

app.post('/api/admin/promociones', (req, res) => {
  const token = req.headers['x-admin-token'];
  if (token !== ADMIN_TOKEN) return res.status(403).json({ error: 'Unauthorized' });

  const { fecha, descuento, horaInicio, horaFin } = req.body;
  if (!descuento || descuento < 0 || descuento > 100) {
    return res.status(400).json({ error: 'Descuento inválido' });
  }

  const horaInicio24 = horaInicio && horaInicio.includes('M') ? convertirA24h(horaInicio) : horaInicio;
  const horaFin24 = horaFin && horaFin.includes('M') ? convertirA24h(horaFin) : horaFin;

  const promo = {
    id: nanoid(),
    fecha: fecha || null,
    descuento: Number(descuento),
    horaInicio: horaInicio24 || null,
    horaFin: horaFin24 || null,
    activa: true,
    creada: new Date().toISOString()
  };

  db.promociones.push(promo);
  saveData(db);
  res.json({ ok: true, promocion: promo });
});

app.get('/api/admin/promociones', (req, res) => {
  const token = req.headers['x-admin-token'];
  if (token !== ADMIN_TOKEN) return res.status(403).json({ error: 'Unauthorized' });
  res.json(db.promociones);
});

app.patch('/api/admin/promociones/:id/toggle', (req, res) => {
  const token = req.headers['x-admin-token'];
  if (token !== ADMIN_TOKEN) return res.status(403).json({ error: 'Unauthorized' });
  const idx = db.promociones.findIndex(p => p.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: 'No encontrada' });
  db.promociones[idx].activa = !db.promociones[idx].activa;
  saveData(db);
  res.json({ ok: true, promocion: db.promociones[idx] });
});

app.delete('/api/admin/promociones/:id', (req, res) => {
  const token = req.headers['x-admin-token'];
  if (token !== ADMIN_TOKEN) return res.status(403).json({ error: 'Unauthorized' });
  const idx = db.promociones.findIndex(p => p.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: 'No encontrada' });
  db.promociones.splice(idx, 1);
  saveData(db);
  res.json({ ok: true });
});

// ============ BLOQUEOS ============
app.get('/api/bloqueos', (req, res) => {
  const { fecha } = req.query;
  if (fecha) return res.json(db.bloqueos.filter(b => b.fecha === fecha));
  res.json(db.bloqueos);
});

app.post('/api/admin/bloqueos', (req, res) => {
  const token = req.headers['x-admin-token'];
  if (token !== ADMIN_TOKEN) return res.status(403).json({ error: 'Unauthorized' });

  const { fecha, horaInicio, horaFin, cancha, motivo } = req.body;
  if (!fecha) return res.status(400).json({ error: 'Falta fecha' });

  const horaInicio24 = horaInicio && horaInicio.includes('M') ? convertirA24h(horaInicio) : horaInicio;
  const horaFin24 = horaFin && horaFin.includes('M') ? convertirA24h(horaFin) : horaFin;

  const bloqueo = {
    id: nanoid(),
    fecha,
    horaInicio: horaInicio24 || null,
    horaFin: horaFin24 || null,
    cancha: cancha || null,
    motivo: motivo || 'Bloqueado',
    creado: new Date().toISOString()
  };

  db.bloqueos.push(bloqueo);
  saveData(db);
  res.json({ ok: true, bloqueo });
});

app.get('/api/admin/bloqueos', (req, res) => {
  const token = req.headers['x-admin-token'];
  if (token !== ADMIN_TOKEN) return res.status(403).json({ error: 'Unauthorized' });
  res.json(db.bloqueos);
});

app.delete('/api/admin/bloqueos/:id', (req, res) => {
  const token = req.headers['x-admin-token'];
  if (token !== ADMIN_TOKEN) return res.status(403).json({ error: 'Unauthorized' });
  const idx = db.bloqueos.findIndex(b => b.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: 'No encontrado' });
  db.bloqueos.splice(idx, 1);
  saveData(db);
  res.json({ ok: true });
});

// ============ CONFIGURACIÓN DE PRECIOS ============
app.get('/api/admin/config', (req, res) => {
  const token = req.headers['x-admin-token'];
  if (token !== ADMIN_TOKEN) return res.status(403).json({ error: 'Unauthorized' });
  res.json(config);
});

app.post('/api/admin/config/precios', (req, res) => {
  const token = req.headers['x-admin-token'];
  if (token !== ADMIN_TOKEN) return res.status(403).json({ error: 'Unauthorized' });

  const { horaDia, horaNoche, cambioTarifa } = req.body;

  if (horaDia !== undefined) config.precios.horaDia = Number(horaDia);
  if (horaNoche !== undefined) config.precios.horaNoche = Number(horaNoche);
  if (cambioTarifa !== undefined) config.precios.cambioTarifa = Number(cambioTarifa);

  saveConfig(config);
  res.json({ ok: true, config });
});

app.get('/api/config/precios', (req, res) => {
  res.json({
    horaDia: config.precios.horaDia,
    horaNoche: config.precios.horaNoche,
    cambioTarifa: config.precios.cambioTarifa
  });
});

// ============ SERVIDOR ============
const PORT = process.env.PORT || 3000;
app.listen(PORT, '0.0.0.0', () => {
  console.log(`Distrito Padel v6.1 corriendo en:`);
  console.log(`   PC:      http://localhost:${PORT}`);
  console.log(`   Celular: http://192.168.1.52:${PORT}`);
  console.log(`\nEstadísticas:`);
  console.log(`   Usuarios: ${Object.keys(db.usuarios).length}`);
  console.log(`   Reservas: ${db.reservas.length}`);
  console.log(`   Promociones: ${db.promociones.length}`);
  console.log(`   Precios: Día $${config.precios.horaDia} | Noche $${config.precios.horaNoche}`);
});

})();
