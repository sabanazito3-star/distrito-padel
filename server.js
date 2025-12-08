import dotenv from 'dotenv';
dotenv.config();
console.log('=== DEBUG VARIABLES ===');
console.log('ADMIN_TOKEN:', process.env.ADMIN_TOKEN);
console.log('EMAIL_USER:', process.env.EMAIL_USER);
console.log('EMAIL_PASS:', process.env.EMAIL_PASS ? '***configurado***' : 'NO CONFIGURADO');
console.log('======================');

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

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(bodyParser.json());
app.use(express.static('public'));

// Configuración del transportador de email
const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS
  }
});

// Archivos de datos
const DATA_FILE = 'data.json';
const CONFIG_FILE = 'config.json';

// Inicializar archivos si no existen
function inicializarArchivos() {
  if (!fs.existsSync(DATA_FILE)) {
    fs.writeFileSync(DATA_FILE, JSON.stringify({ usuarios: [], reservas: [], promociones: [], bloqueos: [] }, null, 2));
  }
  if (!fs.existsSync(CONFIG_FILE)) {
    fs.writeFileSync(CONFIG_FILE, JSON.stringify({ 
      precios: { 
        horaDia: 250, 
        horaNoche: 400, 
        cambioTarifa: 16 
      } 
    }, null, 2));
  }
}

inicializarArchivos();

function leerDatos() {
  return JSON.parse(fs.readFileSync(DATA_FILE, 'utf-8'));
}

function guardarDatos(data) {
  fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));
}

function leerConfig() {
  return JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf-8'));
}

function guardarConfig(config) {
  fs.writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2));
}

// Generar ID único
async function generarId() {
  const { nanoid } = await import('nanoid');
  return nanoid(10);
}

// Verificar token de admin
function verificarAdmin(req, res, next) {
  const token = req.headers['x-admin-token'];
  if (token !== process.env.ADMIN_TOKEN) {
    return res.status(403).json({ error: 'No autorizado' });
  }
  next();
}

// ============ ENDPOINTS PÚBLICOS ============

// Obtener configuración de precios
app.get('/api/config/precios', (req, res) => {
  const config = leerConfig();
  res.json(config.precios);
});

// Registro de usuario
app.post('/api/auth/register', async (req, res) => {
  const { nombre, email, telefono, password } = req.body;
  const data = leerDatos();

  if (data.usuarios.find(u => u.email === email)) {
    return res.json({ ok: false, msg: 'El email ya está registrado' });
  }

  const token = await generarId();
  const nuevoUsuario = { id: await generarId(), nombre, email, telefono, password, token };
  data.usuarios.push(nuevoUsuario);
  guardarDatos(data);

  res.json({ ok: true, token, email, nombre });
});

// Login de usuario
app.post('/api/auth/login', (req, res) => {
  const { email, password } = req.body;
  const data = leerDatos();

  const usuario = data.usuarios.find(u => u.email === email && u.password === password);
  if (!usuario) {
    return res.json({ ok: false, msg: 'Email o contraseña incorrectos' });
  }

  res.json({ ok: true, token: usuario.token, email: usuario.email, nombre: usuario.nombre });
});

// Obtener reservas por fecha
app.get('/api/reservas', (req, res) => {
  const { fecha } = req.query;
  const data = leerDatos();
  const reservas = data.reservas.filter(r => r.fecha === fecha && r.estado !== 'cancelada');
  res.json(reservas);
});

// Obtener promoción activa por fecha
app.get('/api/promociones', (req, res) => {
  const { fecha } = req.query;
  const data = leerDatos();
  const promo = data.promociones.find(p => p.activa && (!p.fecha || p.fecha === fecha));
  res.json(promo || null);
});

// Obtener bloqueos por fecha
app.get('/api/bloqueos', (req, res) => {
  const { fecha } = req.query;
  const data = leerDatos();
  const bloqueos = data.bloqueos.filter(b => b.fecha === fecha);
  res.json(bloqueos);
});

// Verificar si hay solapamiento
function haySolapamiento(fecha, cancha, horaInicio, duracion, reservaId = null) {
  const data = leerDatos();
  const inicioMin = hhmmToMinutes(horaInicio);
  const finMin = inicioMin + duracion * 60;

  return data.reservas.some(r => {
    if (r.id === reservaId) return false;
    if (r.fecha !== fecha) return false;
    if (String(r.cancha) !== String(cancha)) return false;
    if (r.estado === 'cancelada') return false;

    const rInicio = hhmmToMinutes(r.horaInicio);
    const rFin = rInicio + Number(r.duracion) * 60;
    return inicioMin < rFin && rInicio < finMin;
  });
}

function hhmmToMinutes(hhmm) {
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + m;
}

// Crear reserva (usuario)
app.post('/api/reservas/crear', async (req, res) => {
  const { token, fecha, hora, duracion, cancha } = req.body;
  const data = leerDatos();

  const usuario = data.usuarios.find(u => u.token === token);
  if (!usuario) {
    return res.json({ ok: false, msg: 'Usuario no válido' });
  }

  if (haySolapamiento(fecha, cancha, hora, duracion)) {
    return res.json({ ok: false, msg: 'Horario no disponible' });
  }

  const config = leerConfig();
  const precio = calcularPrecio(hora, duracion, config.precios, data.promociones, fecha);

  const reserva = {
    id: await generarId(),
    fecha,
    horaInicio: hora,
    duracion,
    cancha,
    email: usuario.email,
    nombre: usuario.nombre,
    telefono: usuario.telefono,
    precio: precio.total,
    precioBase: precio.base,
    descuento: precio.descuento,
    pagado: false,
    metodoPago: null,
    estado: 'activa',
    esManual: false,
    creada: new Date().toISOString()
  };

  data.reservas.push(reserva);
  guardarDatos(data);

  enviarEmailConfirmacion(usuario.email, reserva);

  res.json({ ok: true, reserva });
});

function calcularPrecio(hora, duracion, precios, promociones, fecha) {
  const [h, m] = hora.split(':').map(Number);
  const inicioMin = h * 60 + m;
  const finMin = inicioMin + duracion * 60;
  const cambioTarifa = precios.cambioTarifa * 60;

  let precioBase = 0;

  if (finMin <= cambioTarifa) {
    precioBase = precios.horaDia * duracion;
  } else if (inicioMin >= cambioTarifa) {
    precioBase = precios.horaNoche * duracion;
  } else {
    const minutosAntes = cambioTarifa - inicioMin;
    const minutosDespues = finMin - cambioTarifa;
    precioBase = (minutosAntes / 60 * precios.horaDia) + (minutosDespues / 60 * precios.horaNoche);
  }

  let descuento = 0;
  const promo = promociones.find(p => p.activa && (!p.fecha || p.fecha === fecha));

  if (promo) {
    if (promo.horaInicio && promo.horaFin) {
      const horaMin = inicioMin;
      const promoInicio = hhmmToMinutes(promo.horaInicio);
      const promoFin = hhmmToMinutes(promo.horaFin);
      if (horaMin >= promoInicio && horaMin < promoFin) {
        descuento = promo.descuento;
      }
    } else {
      descuento = promo.descuento;
    }
  }

  const precioFinal = Math.round(precioBase * (1 - descuento / 100));

  return { total: precioFinal, base: Math.round(precioBase), descuento };
}

function enviarEmailConfirmacion(email, reserva) {
  const mailOptions = {
    from: process.env.EMAIL_USER,
    to: email,
    subject: 'Confirmación de Reserva - Distrito Padel',
    html: `
      <h2>Reserva Confirmada</h2>
      <p><strong>Fecha:</strong> ${reserva.fecha}</p>
      <p><strong>Hora:</strong> ${reserva.horaInicio}</p>
      <p><strong>Duración:</strong> ${reserva.duracion} hora(s)</p>
      <p><strong>Cancha:</strong> ${reserva.cancha}</p>
      <p><strong>Precio:</strong> $${reserva.precio} MXN</p>
      <p>¡Te esperamos!</p>
    `
  };

  transporter.sendMail(mailOptions, (err) => {
    if (err) console.error('Error al enviar email:', err);
  });
}

// Obtener mis reservas
app.get('/api/mis-reservas', (req, res) => {
  const token = req.headers['x-session-token'];
  const data = leerDatos();

  const usuario = data.usuarios.find(u => u.token === token);
  if (!usuario) {
    return res.json([]);
  }

  const reservas = data.reservas.filter(r => r.email === usuario.email && r.estado !== 'cancelada');
  res.json(reservas);
});

// Cancelar reserva (usuario)
app.delete('/api/reservas/:id', (req, res) => {
  const { id } = req.params;
  const token = req.headers['x-session-token'];
  const data = leerDatos();

  const usuario = data.usuarios.find(u => u.token === token);
  if (!usuario) {
    return res.json({ ok: false, msg: 'No autorizado' });
  }

  const reserva = data.reservas.find(r => r.id === id && r.email === usuario.email);
  if (!reserva) {
    return res.json({ ok: false, msg: 'Reserva no encontrada' });
  }

  reserva.estado = 'cancelada';
  reserva.canceladaPor = 'usuario';
  reserva.fechaCancelacion = new Date().toISOString();

  guardarDatos(data);
  res.json({ ok: true });
});

// ============ ENDPOINTS DE ADMIN ============

app.get('/api/admin/reservas', verificarAdmin, (req, res) => {
  const data = leerDatos();
  res.json(data.reservas);
});

app.get('/api/admin/promociones', verificarAdmin, (req, res) => {
  const data = leerDatos();
  res.json(data.promociones);
});

app.get('/api/admin/bloqueos', verificarAdmin, (req, res) => {
  const data = leerDatos();
  res.json(data.bloqueos);
});

app.get('/api/admin/config', verificarAdmin, (req, res) => {
  const config = leerConfig();
  res.json(config);
});

app.post('/api/admin/config/precios', verificarAdmin, (req, res) => {
  const { horaDia, horaNoche, cambioTarifa } = req.body;
  const config = leerConfig();
  
  config.precios = { horaDia, horaNoche, cambioTarifa };
  guardarConfig(config);
  
  res.json({ ok: true, precios: config.precios });
});

app.post('/api/admin/reservas/crear', verificarAdmin, async (req, res) => {
  const { fecha, horaInicio, duracion, cancha, nombreCliente, telefonoCliente, emailCliente } = req.body;

  if (haySolapamiento(fecha, cancha, horaInicio, duracion)) {
    return res.json({ ok: false, msg: 'Horario no disponible' });
  }

  const data = leerDatos();
  const config = leerConfig();
  const precio = calcularPrecio(horaInicio, duracion, config.precios, data.promociones, fecha);

  const reserva = {
    id: await generarId(),
    fecha,
    horaInicio,
    duracion,
    cancha,
    email: emailCliente || 'sin-email@manual.com',
    nombre: nombreCliente,
    telefono: telefonoCliente || 'N/A',
    precio: precio.total,
    precioBase: precio.base,
    descuento: precio.descuento,
    pagado: false,
    metodoPago: null,
    estado: 'activa',
    esManual: true,
    creada: new Date().toISOString()
  };

  data.reservas.push(reserva);
  guardarDatos(data);

  res.json({ ok: true, reserva });
});

app.patch('/api/admin/reservas/:id/pago', verificarAdmin, (req, res) => {
  const { id } = req.params;
  const { pagado, metodoPago } = req.body;
  const data = leerDatos();

  const reserva = data.reservas.find(r => r.id === id);
  if (!reserva) {
    return res.json({ ok: false, msg: 'Reserva no encontrada' });
  }

  reserva.pagado = pagado;
  reserva.metodoPago = pagado ? metodoPago : null;

  guardarDatos(data);
  res.json({ ok: true });
});

app.delete('/api/admin/reservas/:id', verificarAdmin, (req, res) => {
  const { id } = req.params;
  const data = leerDatos();

  const reserva = data.reservas.find(r => r.id === id);
  if (!reserva) {
    return res.json({ ok: false, msg: 'Reserva no encontrada' });
  }

  reserva.estado = 'cancelada';
  reserva.canceladaPor = 'admin';
  reserva.fechaCancelacion = new Date().toISOString();

  guardarDatos(data);
  res.json({ ok: true });
});

app.post('/api/admin/promociones', verificarAdmin, async (req, res) => {
  const { fecha, descuento, horaInicio, horaFin } = req.body;
  const data = leerDatos();

  const promo = {
    id: await generarId(),
    fecha: fecha || null,
    descuento,
    horaInicio: horaInicio || null,
    horaFin: horaFin || null,
    activa: true,
    creada: new Date().toISOString()
  };

  data.promociones.push(promo);
  guardarDatos(data);

  res.json({ ok: true, promo });
});

app.patch('/api/admin/promociones/:id/toggle', verificarAdmin, (req, res) => {
  const { id } = req.params;
  const data = leerDatos();

  const promo = data.promociones.find(p => p.id === id);
  if (!promo) {
    return res.json({ ok: false, msg: 'Promoción no encontrada' });
  }

  promo.activa = !promo.activa;
  guardarDatos(data);

  res.json({ ok: true });
});

app.delete('/api/admin/promociones/:id', verificarAdmin, (req, res) => {
  const { id } = req.params;
  const data = leerDatos();

  data.promociones = data.promociones.filter(p => p.id !== id);
  guardarDatos(data);

  res.json({ ok: true });
});

app.post('/api/admin/bloqueos', verificarAdmin, async (req, res) => {
  const { fecha, horaInicio, horaFin, cancha, motivo } = req.body;
  const data = leerDatos();

  const bloqueo = {
    id: await generarId(),
    fecha,
    horaInicio: horaInicio || null,
    horaFin: horaFin || null,
    cancha: cancha || null,
    motivo,
    creada: new Date().toISOString()
  };

  data.bloqueos.push(bloqueo);
  guardarDatos(data);

  res.json({ ok: true, bloqueo });
});

app.delete('/api/admin/bloqueos/:id', verificarAdmin, (req, res) => {
  const { id } = req.params;
  const data = leerDatos();

  data.bloqueos = data.bloqueos.filter(b => b.id !== id);
  guardarDatos(data);

  res.json({ ok: true });
});

app.get('/api/admin/reporte-cierre', verificarAdmin, (req, res) => {
  const { fecha, mes } = req.query;
  const data = leerDatos();

  let reservas = data.reservas.filter(r => r.pagado && r.estado !== 'cancelada');

  if (fecha) {
    reservas = reservas.filter(r => r.fecha === fecha);
  } else if (mes) {
    reservas = reservas.filter(r => r.fecha.startsWith(mes));
  }

  const totales = {
    efectivo: 0,
    tarjeta: 0,
    transferencia: 0,
    otro: 0,
    total: 0
  };

  reservas.forEach(r => {
    totales.total += r.precio;
    if (r.metodoPago === 'Efectivo') totales.efectivo += r.precio;
    else if (r.metodoPago === 'Tarjeta') totales.tarjeta += r.precio;
    else if (r.metodoPago === 'Transferencia') totales.transferencia += r.precio;
    else totales.otro += r.precio;
  });

  res.json({ reservas, totales });
});

app.listen(PORT, () => {
  console.log(`Servidor corriendo en puerto ${PORT}`);
});
