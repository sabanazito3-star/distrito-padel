// server.js - Distrito Padel v6.3 con Postgres + Resend + Fix Timezone MST - ESM COMPLETO
import 'dotenv/config';
import express from 'express';
import bodyParser from 'body-parser';
import cors from 'cors';
import { Resend } from 'resend';
import crypto from 'crypto';
import pg from 'pg';
import { nanoid } from 'nanoid';


const { Pool } = pg;


const app = express();
app.use(bodyParser.json());
app.use(cors());
app.use(express.static('public'));


const PORT = process.env.PORT || 3000;


// PG POOL
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});


// RESEND
const resend = new Resend(process.env.RESEND_API_KEY);


// 🆕 FUNCIÓN PARA OBTENER FECHA LOCAL MST
function getFechaLocalMST() {
  const ahora = new Date();
  // Convertir a MST (UTC-7)
  const mstOffset = -7 * 60; // MST es UTC-7
  const utcTime = ahora.getTime() + (ahora.getTimezoneOffset() * 60000);
  const mstTime = new Date(utcTime + (mstOffset * 60000));
  
  const year = mstTime.getUTCFullYear();
  const month = String(mstTime.getUTCMonth() + 1).padStart(2, '0');
  const day = String(mstTime.getUTCDate()).padStart(2, '0');
  
  return `${year}-${month}-${day}`;
}


// INICIALIZAR TABLAS
async function initDB() {
  try {
    await pool.query(`CREATE TABLE IF NOT EXISTS usuarios (
      id TEXT PRIMARY KEY, nombre TEXT NOT NULL, email TEXT UNIQUE NOT NULL,
      telefono TEXT NOT NULL, password TEXT NOT NULL, token TEXT UNIQUE NOT NULL,
      created_at TIMESTAMP DEFAULT NOW())`);
    
    await pool.query(`CREATE TABLE IF NOT EXISTS reservas (
      id TEXT PRIMARY KEY, nombre TEXT NOT NULL, email TEXT NOT NULL, telefono TEXT NOT NULL,
      cancha INTEGER NOT NULL, fecha DATE NOT NULL, hora_inicio TEXT NOT NULL,
      duracion DECIMAL NOT NULL, precio DECIMAL NOT NULL, descuento INTEGER DEFAULT 0,
      precio_base DECIMAL, estado TEXT DEFAULT 'pendiente', pagado BOOLEAN DEFAULT false,
      metodo_pago TEXT, es_manual BOOLEAN DEFAULT false, cancelada_por TEXT,
      fecha_cancelacion TIMESTAMP, created_at TIMESTAMP DEFAULT NOW())`);
    
    await pool.query(`CREATE TABLE IF NOT EXISTS promociones (
      id TEXT PRIMARY KEY, fecha DATE, descuento INTEGER NOT NULL,
      hora_inicio TEXT, hora_fin TEXT, activa BOOLEAN DEFAULT true,
      created_at TIMESTAMP DEFAULT NOW())`);
    
    await pool.query(`CREATE TABLE IF NOT EXISTS bloqueos (
      id TEXT PRIMARY KEY, fecha DATE NOT NULL, cancha INTEGER,
      hora_inicio TEXT, hora_fin TEXT, motivo TEXT, created_at TIMESTAMP DEFAULT NOW())`);
    
    console.log('Tablas Postgres listas');
  } catch (err) {
    console.error('Error DB:', err.message);
  }
}


await initDB();


// CARGAR DATA DE PG
async function loadData() {
  try {
    const [usuarios, reservas, promociones, bloqueos] = await Promise.all([
      pool.query('SELECT * FROM usuarios'),
      pool.query('SELECT * FROM reservas ORDER BY created_at DESC'),
      pool.query('SELECT * FROM promociones ORDER BY created_at DESC'),
      pool.query('SELECT * FROM bloqueos ORDER BY created_at DESC')
    ]);
    return {
      usuarios: Object.fromEntries(usuarios.rows.map(u => [u.email, u])),
      reservas: reservas.rows,
      promociones: promociones.rows,
      bloqueos: bloqueos.rows
    };
  } catch (err) {
    console.error('Error loadData:', err.message);
    return { usuarios: {}, reservas: [], promociones: [], bloqueos: [] };
  }
}


let db = await loadData();
let config = { precios: { horaDia: 250, horaNoche: 400, cambioTarifa: 16 } };


// ADMIN TOKEN
const ADMIN_TOKEN = 'distritoadmin23';


function verificarAdmin(req, res, next) {
  const token = req.headers['x-admin-token'];
  if (token !== ADMIN_TOKEN) {
    return res.status(401).json({ ok: false, msg: 'Token inválido' });
  }
  next();
}


// REGISTRO
app.post('/api/auth/register', async (req, res) => {
  try {
    const { nombre, email, telefono, password } = req.body;
    
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return res.status(400).json({ ok: false, msg: 'Email inválido' });
    }
    
    const telLimpio = telefono.replace(/\D/g, '');
    if (telLimpio.length !== 10) {
      return res.status(400).json({ ok: false, msg: 'Teléfono debe tener 10 dígitos' });
    }


    const existe = await pool.query('SELECT * FROM usuarios WHERE email = $1', [email]);
    if (existe.rows.length > 0) {
      return res.status(400).json({ ok: false, msg: 'Email ya registrado' });
    }


    const id = nanoid();
    const token = nanoid();
    const hashedPass = crypto.createHash('sha256').update(password).digest('hex');


    await pool.query(
      `INSERT INTO usuarios (id, nombre, email, telefono, password, token) VALUES ($1,$2,$3,$4,$5,$6)`,
      [id, nombre, email, telLimpio, hashedPass, token]
    );


    db = await loadData();


    try {
      await resend.emails.send({
        from: 'Distrito Padel <reservas@distritopadel.lat>',
        to: [email],
        subject: 'Bienvenido a Distrito Padel',
        html: `<h2>Hola ${nombre}</h2><p>Tu cuenta ha sido creada exitosamente.</p>`
      });
    } catch (err) {
      console.error('Error email:', err.message);
    }


    res.json({ ok: true, token, email, nombre });
  } catch (err) {
    console.error('Registro error:', err.message);
    res.status(500).json({ ok: false, msg: 'Error al registrar' });
  }
});


// LOGIN
app.post('/api/auth/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    const hashedPass = crypto.createHash('sha256').update(password).digest('hex');


    const result = await pool.query(
      'SELECT * FROM usuarios WHERE email = $1 AND password = $2',
      [email, hashedPass]
    );


    if (result.rows.length === 0) {
      return res.status(401).json({ ok: false, msg: 'Credenciales inválidas' });
    }


    const user = result.rows[0];
    res.json({ ok: true, token: user.token, email: user.email, nombre: user.nombre });
  } catch (err) {
    console.error('Login error:', err.message);
    res.status(500).json({ ok: false, msg: 'Error al iniciar sesión' });
  }
});


// RESERVAS GET
app.get('/api/reservas', async (req, res) => {
  const { fecha } = req.query;
  db = await loadData();
  
  if (fecha) {
    const reservas = db.reservas.filter(r => r.fecha === fecha && r.estado !== 'cancelada');
    return res.json(reservas);
  }
  res.json(db.reservas);
});


// CREAR RESERVA (🆕 FIX TIMEZONE MST)
app.post('/api/reservas/crear', async (req, res) => {
  const { token, fecha, hora, duracion, cancha } = req.body;


  if (!token || !fecha || !hora || !duracion || !cancha) {
    return res.json({ ok: false, msg: 'Faltan datos' });
  }


  try {
    // Verificar usuario
    const userRes = await pool.query('SELECT * FROM usuarios WHERE token = $1', [token]);
    if (userRes.rows.length === 0) {
      return res.json({ ok: false, msg: 'Token inválido' });
    }


    const user = userRes.rows[0];


    // 🆕 FIX: Verificar límite de 7 días usando fecha local MST
    const hoyMST = getFechaLocalMST();
    const fechaReserva = fecha;
    
    // Comparar strings de fechas directamente
    if (fechaReserva < hoyMST) {
      return res.json({ ok: false, msg: 'No puedes reservar en fechas pasadas' });
    }
    
    // Calcular diferencia de días
    const hoyDate = new Date(hoyMST + 'T00:00:00');
    const reservaDate = new Date(fechaReserva + 'T00:00:00');
    const diffDias = Math.ceil((reservaDate - hoyDate) / (1000 * 60 * 60 * 24));
    
    if (diffDias > 7) {
      return res.json({ ok: false, msg: 'Solo puedes reservar hasta 7 días adelante' });
    }


    // Verificar disponibilidad (simplificado)
    const reservasExistentes = await pool.query(
      `SELECT hora_inicio, duracion FROM reservas 
       WHERE fecha = $1 AND cancha = $2 AND estado != 'cancelada'`,
      [fecha, cancha]
    );


    // Verificar overlap manual
    const [horaNum, minNum] = hora.split(':').map(Number);
    const inicioMin = horaNum * 60 + minNum;
    const finMin = inicioMin + (parseFloat(duracion) * 60);


    for (const r of reservasExistentes.rows) {
      const [rHora, rMin] = r.hora_inicio.split(':').map(Number);
      const rInicioMin = rHora * 60 + (rMin || 0);
      const rFinMin = rInicioMin + (parseFloat(r.duracion) * 60);
      
      if (inicioMin < rFinMin && finMin > rInicioMin) {
        return res.json({ ok: false, msg: 'Horario no disponible' });
      }
    }


    // Calcular precio base
    const horaDecimal = horaNum + (minNum / 60);
    const cambioTarifa = config.precios.cambioTarifa;
    
    let precioBase = 0;
    const duracionNum = parseFloat(duracion);
    
    if (horaDecimal < cambioTarifa && (horaDecimal + duracionNum) <= cambioTarifa) {
      precioBase = duracionNum * config.precios.horaDia;
    } else if (horaDecimal >= cambioTarifa) {
      precioBase = duracionNum * config.precios.horaNoche;
    } else {
      const horasAntes = cambioTarifa - horaDecimal;
      const horasDespues = duracionNum - horasAntes;
      precioBase = (horasAntes * config.precios.horaDia) + (horasDespues * config.precios.horaNoche);
    }


    // Buscar promoción
    let descuento = 0;
    const promoRes = await pool.query(
      `SELECT descuento, hora_inicio, hora_fin FROM promociones 
       WHERE activa = true 
       AND (fecha IS NULL OR fecha = $1)
       ORDER BY descuento DESC
       LIMIT 1`,
      [fecha]
    );


    if (promoRes.rows.length > 0) {
      const promo = promoRes.rows[0];
      
      if (promo.hora_inicio && promo.hora_fin) {
        const [pH, pM] = promo.hora_inicio.split(':').map(Number);
        const [pHf, pMf] = promo.hora_fin.split(':').map(Number);
        const promoInicioMin = pH * 60 + (pM || 0);
        const promoFinMin = pHf * 60 + (pMf || 0);
        
        if (inicioMin >= promoInicioMin && inicioMin < promoFinMin) {
          descuento = promo.descuento;
        }
      } else {
        descuento = promo.descuento;
      }
    }


    const precioFinal = Math.round(precioBase * (1 - descuento / 100));


    // Crear reserva
    const id = crypto.randomUUID();
    await pool.query(
      `INSERT INTO reservas 
       (id, nombre, email, telefono, cancha, fecha, hora_inicio, duracion, precio, descuento, precio_base, estado, pagado)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, 'pendiente', false)`,
      [id, user.nombre, user.email, user.telefono, cancha, fecha, hora, duracion, precioFinal, descuento, Math.round(precioBase)]
    );


    // Enviar email
    try {
      await resend.emails.send({
        from: 'Distrito Padel <reservas@distritopadel.lat>',
        to: user.email,
        subject: '✅ Reserva Confirmada - Distrito Padel',
        html: `
          <h2>¡Reserva Confirmada!</h2>
          <p>Hola ${user.nombre},</p>
          <p>Tu reserva ha sido confirmada:</p>
          <ul>
            <li><strong>Cancha:</strong> ${cancha}</li>
            <li><strong>Fecha:</strong> ${fecha}</li>
            <li><strong>Hora:</strong> ${hora}</li>
            <li><strong>Duración:</strong> ${duracion}h</li>
            ${descuento > 0 ? `<li><strong>Descuento aplicado:</strong> ${descuento}%</li>` : ''}
            <li><strong>Total a pagar:</strong> $${precioFinal} MXN</li>
          </ul>
          <p>Te esperamos!</p>
        `
      });
    } catch (emailErr) {
      console.error('Error email:', emailErr);
    }


    res.json({ ok: true, msg: 'Reserva creada', reservaId: id, precio: precioFinal, descuento });


  } catch (err) {
    console.error('Error crear reserva:', err);
    res.status(500).json({ ok: false, msg: 'Error: ' + err.message });
  }
});


// MIS RESERVAS
app.get('/api/mis-reservas', async (req, res) => {
  try {
    const token = req.headers['x-token'];
    const user = await pool.query('SELECT * FROM usuarios WHERE token = $1', [token]);
    
    if (user.rows.length === 0) {
      return res.status(401).json({ ok: false, msg: 'Token inválido' });
    }


    const reservas = await pool.query(
      `SELECT * FROM reservas WHERE email = $1 AND estado != 'cancelada' ORDER BY fecha, hora_inicio`,
      [user.rows[0].email]
    );


    res.json(reservas.rows);
  } catch (err) {
    console.error('Mis reservas error:', err.message);
    res.json([]);
  }
});


// CANCELAR RESERVA (USUARIO)
app.delete('/api/reservas/:id', async (req, res) => {
  try {
    const token = req.headers['x-token'];
    const user = await pool.query('SELECT * FROM usuarios WHERE token = $1', [token]);
    
    if (user.rows.length === 0) {
      return res.status(401).json({ ok: false, msg: 'Token inválido' });
    }


    await pool.query(
      `UPDATE reservas SET estado = 'cancelada', cancelada_por = 'usuario', fecha_cancelacion = NOW() 
       WHERE id = $1 AND email = $2`,
      [req.params.id, user.rows[0].email]
    );


    db = await loadData();
    res.json({ ok: true });
  } catch (err) {
    console.error('Cancelar error:', err.message);
    res.status(500).json({ ok: false, msg: 'Error al cancelar' });
  }
});


// DISPONIBILIDAD
app.get('/api/disponibilidad', async (req, res) => {
  try {
    const { fecha, cancha } = req.query;
    
    const [reservas, bloqueos] = await Promise.all([
      pool.query(
        `SELECT * FROM reservas WHERE fecha = $1 AND cancha = $2 AND estado != 'cancelada'`,
        [fecha, parseInt(cancha)]
      ),
      pool.query(
        `SELECT * FROM bloqueos WHERE fecha = $1 AND (cancha IS NULL OR cancha = $2)`,
        [fecha, parseInt(cancha)]
      )
    ]);


    res.json({
      reservas: reservas.rows,
      bloqueos: bloqueos.rows
    });
  } catch (err) {
    console.error('Disponibilidad error:', err.message);
    res.json({ reservas: [], bloqueos: [] });
  }
});


// PROMOCIONES GET
app.get('/api/promociones', async (req, res) => {
  db = await loadData();
  res.json(db.promociones);
});


// CREAR PROMOCION (ADMIN)
app.post('/api/admin/promociones', verificarAdmin, async (req, res) => {
  try {
    const { fecha, descuento, horaInicio, horaFin } = req.body;
    const id = nanoid();


    await pool.query(
      `INSERT INTO promociones (id, fecha, descuento, hora_inicio, hora_fin, activa)
       VALUES ($1,$2,$3,$4,$5,true)`,
      [id, fecha, descuento, horaInicio || null, horaFin || null]
    );


    db = await loadData();
    res.json({ ok: true });
  } catch (err) {
    console.error('Crear promo error:', err.message);
    res.status(500).json({ ok: false, msg: 'Error al crear promoción' });
  }
});


// ELIMINAR PROMOCION (ADMIN)
app.delete('/api/admin/promociones/:id', verificarAdmin, async (req, res) => {
  try {
    await pool.query('DELETE FROM promociones WHERE id = $1', [req.params.id]);
    db = await loadData();
    res.json({ ok: true });
  } catch (err) {
    console.error('Eliminar promo error:', err.message);
    res.status(500).json({ ok: false, msg: 'Error al eliminar promoción' });
  }
});


// BLOQUEOS GET
app.get('/api/bloqueos', async (req, res) => {
  db = await loadData();
  res.json(db.bloqueos);
});


// CREAR BLOQUEO (ADMIN)
app.post('/api/admin/bloqueos', verificarAdmin, async (req, res) => {
  try {
    const { fecha, cancha, horaInicio, horaFin, motivo } = req.body;
    const id = nanoid();


    await pool.query(
      `INSERT INTO bloqueos (id, fecha, cancha, hora_inicio, hora_fin, motivo)
       VALUES ($1,$2,$3,$4,$5,$6)`,
      [id, fecha, cancha || null, horaInicio || null, horaFin || null, motivo || '']
    );


    db = await loadData();
    res.json({ ok: true });
  } catch (err) {
    console.error('Crear bloqueo error:', err.message);
    res.status(500).json({ ok: false, msg: 'Error al crear bloqueo' });
  }
});


// ELIMINAR BLOQUEO (ADMIN)
app.delete('/api/admin/bloqueos/:id', verificarAdmin, async (req, res) => {
  try {
    await pool.query('DELETE FROM bloqueos WHERE id = $1', [req.params.id]);
    db = await loadData();
    res.json({ ok: true });
  } catch (err) {
    console.error('Eliminar bloqueo error:', err.message);
    res.status(500).json({ ok: false, msg: 'Error al eliminar bloqueo' });
  }
});


// ADMIN - TODAS LAS RESERVAS
app.get('/api/admin/reservas', verificarAdmin, async (req, res) => {
  db = await loadData();
  res.json(db.reservas);
});


// ADMIN - TODOS LOS USUARIOS
app.get('/api/admin/usuarios', verificarAdmin, async (req, res) => {
  db = await loadData();
  res.json(Object.values(db.usuarios));
});


// ADMIN - MARCAR PAGADO
app.patch('/api/admin/reservas/:id/pagar', verificarAdmin, async (req, res) => {
  try {
    const { metodoPago } = req.body;
    
    if (!metodoPago || !['1', '2', '3'].includes(metodoPago)) {
      return res.status(400).json({ ok: false, msg: 'Método de pago inválido' });
    }


    const metodoTexto = { '1': 'Efectivo', '2': 'Tarjeta', '3': 'Transferencia' }[metodoPago];


    await pool.query(
      `UPDATE reservas SET pagado = true, metodo_pago = $1, estado = 'pagada' WHERE id = $2`,
      [metodoTexto, req.params.id]
    );


    db = await loadData();
    res.json({ ok: true });
  } catch (err) {
    console.error('Marcar pagado error:', err.message);
    res.status(500).json({ ok: false, msg: 'Error al marcar pagado' });
  }
});


// ADMIN - MARCAR PENDIENTE
app.patch('/api/admin/reservas/:id/marcar-pendiente', verificarAdmin, async (req, res) => {
  try {
    await pool.query(
      `UPDATE reservas SET pagado = false, metodo_pago = NULL, estado = 'pendiente' WHERE id = $1`,
      [req.params.id]
    );


    db = await loadData();
    res.json({ ok: true, msg: 'Marcada como pendiente' });
  } catch (err) {
    console.error('Marcar pendiente error:', err.message);
    res.status(500).json({ ok: false, msg: 'Error al marcar pendiente' });
  }
});


// ADMIN - CANCELAR RESERVA
app.patch('/api/admin/reservas/:id/cancelar', verificarAdmin, async (req, res) => {
  try {
    await pool.query(
      `UPDATE reservas SET estado = 'cancelada', cancelada_por = 'admin', fecha_cancelacion = NOW() WHERE id = $1`,
      [req.params.id]
    );


    db = await loadData();
    res.json({ ok: true });
  } catch (err) {
    console.error('Cancelar admin error:', err.message);
    res.status(500).json({ ok: false, msg: 'Error al cancelar' });
  }
});


// ADMIN - CREAR RESERVA MANUAL
app.post('/api/admin/reservas/manual', verificarAdmin, async (req, res) => {
  try {
    const { nombre, email, telefono, fecha, hora, duracion, cancha } = req.body;


    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return res.status(400).json({ ok: false, msg: 'Email inválido' });
    }


    const telLimpio = telefono.replace(/\D/g, '');
    if (telLimpio.length !== 10) {
      return res.status(400).json({ ok: false, msg: 'Teléfono debe tener 10 dígitos' });
    }


    // Calcular precio
    const [h, m] = hora.split(':').map(Number);
    const inicioMin = h * 60 + m;
    const finMin = inicioMin + duracion * 60;
    const cambioMin = config.precios.cambioTarifa * 60;


    let precioBase = 0;
    if (finMin <= cambioMin) {
      precioBase = config.precios.horaDia * duracion;
    } else if (inicioMin >= cambioMin) {
      precioBase = config.precios.horaNoche * duracion;
    } else {
      const antesMin = cambioMin - inicioMin;
      const despuesMin = finMin - cambioMin;
      precioBase = (antesMin / 60 * config.precios.horaDia) + (despuesMin / 60 * config.precios.horaNoche);
    }


    let precioFinal = Math.round(precioBase);
    let descuento = 0;


    // Verificar promoción
    const promo = await pool.query(
      'SELECT * FROM promociones WHERE fecha = $1 AND activa = true',
      [fecha]
    );


    if (promo.rows.length > 0) {
      const p = promo.rows[0];
      if (!p.hora_inicio || !p.hora_fin) {
        descuento = p.descuento;
        precioFinal = Math.round(precioBase * (1 - descuento / 100));
      } else {
        const horaMin = inicioMin;
        const promoInicio = parseInt(p.hora_inicio.split(':')[0]) * 60 + parseInt(p.hora_inicio.split(':')[1]);
        const promoFin = parseInt(p.hora_fin.split(':')[0]) * 60 + parseInt(p.hora_fin.split(':')[1]);
        if (horaMin >= promoInicio && horaMin < promoFin) {
          descuento = p.descuento;
          precioFinal = Math.round(precioBase * (1 - descuento / 100));
        }
      }
    }


    const id = nanoid();
    await pool.query(
      `INSERT INTO reservas (id, nombre, email, telefono, cancha, fecha, hora_inicio, duracion, precio, descuento, precio_base, estado, pagado, es_manual)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,'pendiente',false,true)`,
      [id, nombre, email, telLimpio, cancha, fecha, hora, duracion, precioFinal, descuento, precioBase]
    );


    db = await loadData();
    res.json({ ok: true });
  } catch (err) {
    console.error('Reserva manual error:', err.message);
    res.status(500).json({ ok: false, msg: 'Error al crear reserva manual' });
  }
});


// ADMIN - REPORTE DIA PROFESIONAL
app.get('/api/admin/reporte/dia', verificarAdmin, async (req, res) => {
  try {
    const { fecha } = req.query;
    
    const reservas = await pool.query(
      `SELECT * FROM reservas WHERE fecha = $1 AND estado != 'cancelada' ORDER BY hora_inicio`,
      [fecha]
    );


    const rows = reservas.rows;
    
    // Calcular totales
    const totalReservas = rows.length;
    const totalRecaudado = rows.reduce((sum, r) => sum + parseFloat(r.precio || 0), 0);
    const totalPagado = rows.filter(r => r.pagado).reduce((sum, r) => sum + parseFloat(r.precio || 0), 0);
    const totalPendiente = totalRecaudado - totalPagado;
    
    // Por método de pago
    const efectivo = rows.filter(r => r.metodo_pago === 'Efectivo' && r.pagado).reduce((sum, r) => sum + parseFloat(r.precio || 0), 0);
    const tarjeta = rows.filter(r => r.metodo_pago === 'Tarjeta' && r.pagado).reduce((sum, r) => sum + parseFloat(r.precio || 0), 0);
    const transferencia = rows.filter(r => r.metodo_pago === 'Transferencia' && r.pagado).reduce((sum, r) => sum + parseFloat(r.precio || 0), 0);
    
    // Con descuento
    const conDescuento = rows.filter(r => r.descuento > 0).length;
    const descuentoTotal = rows.reduce((sum, r) => {
      if (r.descuento > 0 && r.precio_base) {
        return sum + (parseFloat(r.precio_base) - parseFloat(r.precio));
      }
      return sum;
    }, 0);


    let csv = `REPORTE DE CIERRE - ${fecha}\n`;
    csv += `Distrito Padel\n`;
    csv += `Generado: ${new Date().toLocaleString('es-MX')}\n\n`;
    
    csv += `=== RESUMEN GENERAL ===\n`;
    csv += `Total Reservas,${totalReservas}\n`;
    csv += `Total Recaudado,$${Math.round(totalRecaudado).toLocaleString()} MXN\n`;
    csv += `Total Pagado,$${Math.round(totalPagado).toLocaleString()} MXN\n`;
    csv += `Total Pendiente,$${Math.round(totalPendiente).toLocaleString()} MXN\n\n`;
    
    csv += `=== DESGLOSE POR MÉTODO DE PAGO ===\n`;
    csv += `Efectivo,$${Math.round(efectivo).toLocaleString()} MXN\n`;
    csv += `Tarjeta,$${Math.round(tarjeta).toLocaleString()} MXN\n`;
    csv += `Transferencia,$${Math.round(transferencia).toLocaleString()} MXN\n\n`;
    
    csv += `=== PROMOCIONES Y DESCUENTOS ===\n`;
    csv += `Reservas con descuento,${conDescuento}\n`;
    csv += `Descuento total aplicado,$${Math.round(descuentoTotal).toLocaleString()} MXN\n\n`;
    
    csv += `=== DETALLE DE RESERVAS ===\n`;
    csv += `Hora,Duración,Cancha,Cliente,Email,Teléfono,Precio Base,Descuento %,Precio Final,Estado Pago,Método Pago\n`;
    
    rows.forEach(r => {
      csv += `${r.hora_inicio},${r.duracion}h,${r.cancha},${r.nombre},${r.email},${r.telefono},$${r.precio_base || r.precio},${r.descuento || 0}%,$${r.precio},${r.pagado ? 'Pagada' : 'Pendiente'},${r.metodo_pago || 'N/A'}\n`;
    });


    csv += `\n=== TOTALES FINALES ===\n`;
    csv += `TOTAL RECAUDADO,$${Math.round(totalRecaudado).toLocaleString()} MXN\n`;
    csv += `TOTAL PAGADO,$${Math.round(totalPagado).toLocaleString()} MXN\n`;
    csv += `TOTAL PENDIENTE,$${Math.round(totalPendiente).toLocaleString()} MXN\n`;


    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="reporte_detallado_${fecha}.csv"`);
    res.send('\uFEFF' + csv); // UTF-8 BOM para Excel
  } catch (err) {
    console.error('Reporte dia error:', err.message);
    res.status(500).json({ ok: false, msg: 'Error al generar reporte' });
  }
});


// ADMIN - REPORTE MES PROFESIONAL
app.get('/api/admin/reporte/mes', verificarAdmin, async (req, res) => {
  try {
    const { mes, año } = req.query;
    const fechaInicio = `${año}-${mes.padStart(2, '0')}-01`;
    const ultimoDia = new Date(parseInt(año), parseInt(mes), 0).getDate();
    const fechaFin = `${año}-${mes.padStart(2, '0')}-${ultimoDia}`;


    const reservas = await pool.query(
      `SELECT * FROM reservas WHERE fecha >= $1 AND fecha <= $2 AND estado != 'cancelada' ORDER BY fecha, hora_inicio`,
      [fechaInicio, fechaFin]
    );


    const rows = reservas.rows;
    
    // Calcular totales
    const totalReservas = rows.length;
    const totalRecaudado = rows.reduce((sum, r) => sum + parseFloat(r.precio || 0), 0);
    const totalPagado = rows.filter(r => r.pagado).reduce((sum, r) => sum + parseFloat(r.precio || 0), 0);
    const totalPendiente = totalRecaudado - totalPagado;
    
    // Por método de pago
    const efectivo = rows.filter(r => r.metodo_pago === 'Efectivo' && r.pagado).reduce((sum, r) => sum + parseFloat(r.precio || 0), 0);
    const tarjeta = rows.filter(r => r.metodo_pago === 'Tarjeta' && r.pagado).reduce((sum, r) => sum + parseFloat(r.precio || 0), 0);
    const transferencia = rows.filter(r => r.metodo_pago === 'Transferencia' && r.pagado).reduce((sum, r) => sum + parseFloat(r.precio || 0), 0);
    
    // Por cancha
    const cancha1 = rows.filter(r => r.cancha === 1).length;
    const cancha2 = rows.filter(r => r.cancha === 2).length;
    const cancha3 = rows.filter(r => r.cancha === 3).length;
    
    // Con descuento
    const conDescuento = rows.filter(r => r.descuento > 0).length;
    const descuentoTotal = rows.reduce((sum, r) => {
      if (r.descuento > 0 && r.precio_base) {
        return sum + (parseFloat(r.precio_base) - parseFloat(r.precio));
      }
      return sum;
    }, 0);
    
    // Por día
    const porDia = {};
    rows.forEach(r => {
      const dia = r.fecha.toISOString().split('T')[0];
      if (!porDia[dia]) porDia[dia] = { reservas: 0, monto: 0 };
      porDia[dia].reservas++;
      porDia[dia].monto += parseFloat(r.precio || 0);
    });


    const nombreMes = new Date(parseInt(año), parseInt(mes) - 1).toLocaleString('es-MX', { month: 'long' });


    let csv = `REPORTE MENSUAL - ${nombreMes.toUpperCase()} ${año}\n`;
    csv += `Distrito Padel\n`;
    csv += `Generado: ${new Date().toLocaleString('es-MX')}\n\n`;
    
    csv += `=== RESUMEN GENERAL ===\n`;
    csv += `Total Reservas,${totalReservas}\n`;
    csv += `Total Recaudado,$${Math.round(totalRecaudado).toLocaleString()} MXN\n`;
    csv += `Total Pagado,$${Math.round(totalPagado).toLocaleString()} MXN\n`;
    csv += `Total Pendiente,$${Math.round(totalPendiente).toLocaleString()} MXN\n`;
    csv += `Promedio por Reserva,$${Math.round(totalRecaudado / totalReservas).toLocaleString()} MXN\n\n`;
    
    csv += `=== DESGLOSE POR MÉTODO DE PAGO ===\n`;
    csv += `Efectivo,$${Math.round(efectivo).toLocaleString()} MXN,${Math.round(efectivo / totalPagado * 100)}%\n`;
    csv += `Tarjeta,$${Math.round(tarjeta).toLocaleString()} MXN,${Math.round(tarjeta / totalPagado * 100)}%\n`;
    csv += `Transferencia,$${Math.round(transferencia).toLocaleString()} MXN,${Math.round(transferencia / totalPagado * 100)}%\n\n`;
    
    csv += `=== DESGLOSE POR CANCHA ===\n`;
    csv += `Cancha 1,${cancha1} reservas\n`;
    csv += `Cancha 2,${cancha2} reservas\n`;
    csv += `Cancha 3,${cancha3} reservas\n\n`;
    
    csv += `=== PROMOCIONES Y DESCUENTOS ===\n`;
    csv += `Reservas con descuento,${conDescuento}\n`;
    csv += `Descuento total aplicado,$${Math.round(descuentoTotal).toLocaleString()} MXN\n\n`;
    
    csv += `=== RENDIMIENTO POR DÍA ===\n`;
    csv += `Fecha,Reservas,Monto\n`;
    Object.keys(porDia).sort().forEach(dia => {
      csv += `${dia},${porDia[dia].reservas},$${Math.round(porDia[dia].monto).toLocaleString()}\n`;
    });
    
    csv += `\n=== DETALLE COMPLETO DE RESERVAS ===\n`;
    csv += `Fecha,Hora,Duración,Cancha,Cliente,Email,Teléfono,Precio Base,Descuento %,Precio Final,Estado Pago,Método Pago\n`;
    
    rows.forEach(r => {
      csv += `${r.fecha.toISOString().split('T')[0]},${r.hora_inicio},${r.duracion}h,${r.cancha},${r.nombre},${r.email},${r.telefono},$${r.precio_base || r.precio},${r.descuento || 0}%,$${r.precio},${r.pagado ? 'Pagada' : 'Pendiente'},${r.metodo_pago || 'N/A'}\n`;
    });


    csv += `\n=== TOTALES FINALES ===\n`;
    csv += `TOTAL RECAUDADO,$${Math.round(totalRecaudado).toLocaleString()} MXN\n`;
    csv += `TOTAL PAGADO,$${Math.round(totalPagado).toLocaleString()} MXN\n`;
    csv += `TOTAL PENDIENTE,$${Math.round(totalPendiente).toLocaleString()} MXN\n`;


    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="reporte_mensual_${mes}_${año}.csv"`);
    res.send('\uFEFF' + csv); // UTF-8 BOM para Excel
  } catch (err) {
    console.error('Reporte mes error:', err.message);
    res.status(500).json({ ok: false, msg: 'Error al generar reporte' });
  }
});


// ADMIN - VERIFICAR TOKEN
app.post('/api/admin/verify', async (req, res) => {
  const { token } = req.body;
  res.json({ valid: token === ADMIN_TOKEN });
});


// ADMIN - GET CONFIG
app.get('/api/admin/config', verificarAdmin, async (req, res) => {
  res.json(config);
});


// ADMIN - UPDATE CONFIG
app.post('/api/admin/config', verificarAdmin, async (req, res) => {
  try {
    const { horaDia, horaNoche, cambioTarifa } = req.body;
    
    config.precios = {
      horaDia: parseFloat(horaDia),
      horaNoche: parseFloat(horaNoche),
      cambioTarifa: parseInt(cambioTarifa)
    };


    res.json({ ok: true, config });
  } catch (err) {
    console.error('Config error:', err.message);
    res.status(500).json({ ok: false, msg: 'Error al actualizar configuración' });
  }
});


// GET CONFIG PUBLICA
app.get('/api/config', async (req, res) => {
  res.json(config);
});


// TEST ENDPOINT
app.get('/api/test', async (req, res) => {
  try {
    const [usuarios, reservas, promociones, bloqueos] = await Promise.all([
      pool.query('SELECT COUNT(*) as count FROM usuarios'),
      pool.query('SELECT COUNT(*) as count FROM reservas'),
      pool.query('SELECT COUNT(*) as count FROM promociones'),
      pool.query('SELECT COUNT(*) as count FROM bloqueos')
    ]);


    res.json({
      db: 'OK',
      usuarios: usuarios.rows[0].count,
      reservas: reservas.rows[0].count,
      promociones: promociones.rows[0].count,
      bloqueos: bloqueos.rows[0].count,
      admin_token: ADMIN_TOKEN,
      fecha_mst_actual: getFechaLocalMST()
    });
  } catch (err) {
    res.json({ db: 'ERROR', error: err.message });
  }
});


// INICIAR SERVIDOR
app.listen(PORT, '0.0.0.0', async () => {
  db = await loadData();
  console.log(`Distrito Padel v6.3 ESM + Timezone Fix corriendo en puerto ${PORT}`);
  console.log(`Usuarios: ${Object.keys(db.usuarios).length}`);
  console.log(`Reservas: ${db.reservas.length}`);
  console.log(`Promociones: ${db.promociones.length}`);
  console.log(`Bloqueos: ${db.bloqueos.length}`);
  console.log(`Admin Token: ${ADMIN_TOKEN}`);
  console.log(`Fecha MST actual: ${getFechaLocalMST()}`);
});
