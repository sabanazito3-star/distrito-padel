// server.js - Distrito Padel v7.8 ESM + Postgres + RESEND + Mis Reservas
import express from 'express';
import bodyParser from 'body-parser';
import cors from 'cors';
import { Resend } from 'resend';
import { Pool } from 'pg';
import { nanoid } from 'nanoid';
import crypto from 'crypto';

const app = express();
app.use(bodyParser.json());
app.use(cors());
app.use(express.static('public'));

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

// ✅ RESEND
const resend = new Resend(process.env.RESEND_API_KEY);

// ✅ ADMIN TOKEN
const ADMIN_TOKEN = 'distritoadmin23';

let config = { precios: { horaDia: 250, horaNoche: 400, cambioTarifa: 16 } };

async function query(text, params) {
  const result = await pool.query(text, params);
  return result.rows;
}

async function crearTablas() {
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS usuarios (
        id TEXT PRIMARY KEY, nombre TEXT NOT NULL, email TEXT UNIQUE NOT NULL,
        telefono TEXT NOT NULL, password TEXT NOT NULL, token TEXT UNIQUE NOT NULL,
        created_at TIMESTAMP DEFAULT NOW()
      )
    `);
    await pool.query(`
      CREATE TABLE IF NOT EXISTS reservas (
        id TEXT PRIMARY KEY, nombre TEXT NOT NULL, email TEXT NOT NULL, telefono TEXT NOT NULL,
        cancha INTEGER NOT NULL CHECK (cancha >=1 AND cancha <=4), fecha DATE NOT NULL,
        hora_inicio TIME NOT NULL, duracion_minutos INTEGER NOT NULL CHECK (duracion_minutos > 0),
        precio_total DECIMAL(10,2) NOT NULL, estado TEXT DEFAULT 'pendiente' CHECK (estado IN ('pendiente','pagada','cancelada')),
        metodo_pago TEXT, cancelada_por TEXT, created_at TIMESTAMP DEFAULT NOW()
      )
    `);
    console.log('✅ Tablas Postgres listas');
  } catch (err) {
    console.error('❌ Error tablas:', err.message);
  }
}

// ✅ REGISTRO + EMAIL
app.post('/api/registro', async (req, res) => {
  try {
    const { nombre, email, telefono, password } = req.body;
    const id = nanoid();
    const token = nanoid();
    const hashedPass = crypto.createHash('sha256').update(password).digest('hex');
    
    await pool.query(
      `INSERT INTO usuarios (id, nombre, email, telefono, password, token) VALUES ($1,$2,$3,$4,$5,$6)`,
      [id, nombre, email, telefono, hashedPass, token]
    );
    
    await resend.emails.send({
      from: 'Distrito Padel <noreply@distritopadel.com>',
      to: [email],
      subject: '✅ Bienvenido a Distrito Padel',
      html: `<h2>¡Hola ${nombre}!</h2><p>Tu cuenta ha sido creada exitosamente.</p><p>¡Nos vemos en la cancha! 🎾</p>`
    });
    
    res.json({ success: true, token });
  } catch (err) {
    console.error('Registro error:', err.message);
    res.status(400).json({ error: 'Email ya existe' });
  }
});

// ✅ LOGIN
app.post('/api/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    const hashedPass = crypto.createHash('sha256').update(password).digest('hex');
    
    const users = await pool.query(
      `SELECT * FROM usuarios WHERE email = $1 AND password = $2`,
      [email, hashedPass]
    );
    
    if (users.length === 0) return res.status(401).json({ error: 'Credenciales inválidas' });
    res.json({ success: true, token: users[0].token, nombre: users[0].nombre });
  } catch (err) {
    res.status(500).json({ error: 'Error login' });
  }
});

// ✅ DISPONIBILIDAD
app.get('/api/disponibilidad', async (req, res) => {
  try {
    const { fecha, cancha } = req.query;
    const reservas = await pool.query(
      `SELECT * FROM reservas WHERE fecha = $1 AND cancha = $2 AND estado != 'cancelada'`,
      [fecha, parseInt(cancha)]
    );
    res.json(reservas);
  } catch (err) {
    res.json([]);
  }
});

// ✅ RESERVAS + EMAIL
app.post('/api/reservas', async (req, res) => {
  try {
    const { nombre, email, telefono, fecha, hora_inicio, duracion_minutos, cancha, precio_total } = req.body;
    const id = nanoid();
    
    await pool.query(
      `INSERT INTO reservas (id, nombre, email, telefono, cancha, fecha, hora_inicio, duracion_minutos, precio_total, estado)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,'pendiente')`,
      [id, nombre, email, telefono, parseInt(cancha), fecha, hora_inicio, parseInt(duracion_minutos), parseFloat(precio_total)]
    );
    
    const hora12 = new Date(`2000-01-01T${hora_inicio}`).toLocaleTimeString('es-MX', {hour: '2-digit', minute:'2-digit'});
    await resend.emails.send({
      from: 'Distrito Padel <noreply@distritopadel.com>',
      to: [email],
      subject: `✅ Reserva Confirmada - Cancha ${cancha}`,
      html: `
        <h2>¡Reserva Confirmada ${nombre}!</h2>
        <div style="background: #f0f9ff; padding: 20px; border-radius: 10px; margin: 20px 0;">
          <p><strong>Cancha:</strong> ${cancha}</p>
          <p><strong>Fecha:</strong> ${fecha}</p>
          <p><strong>Hora:</strong> ${hora12}</p>
          <p><strong>Duración:</strong> ${duracion_minutos} min</p>
          <p><strong>Total:</strong> $${precio_total} MXN</p>
          <p><strong>Estado:</strong> <span style="color: orange;">Pendiente de pago</span></p>
        </div>
        <p>¡Nos vemos en la cancha! 🎾</p>
      `
    });
    
    res.json({ success: true });
  } catch (err) {
    console.error('Reserva error:', err.message);
    res.status(400).json({ error: 'Error al crear reserva' });
  }
});

// ✅ MIS RESERVAS
app.get('/api/mis-reservas', async (req, res) => {
  try {
    const email = req.headers['x-email'];
    if (!email) return res.json([]);
    
    const reservas = await pool.query(`
      SELECT * FROM reservas 
      WHERE email = $1 AND estado != 'cancelada' 
      ORDER BY fecha, hora_inicio
    `, [email]);
    
    res.json(reservas);
  } catch (err) {
    console.error('Mis reservas error:', err.message);
    res.json([]);
  }
});

// ✅ ADMIN ENDPOINTS
app.get('/api/reservas', async (req, res) => {
  try {
    const reservas = await pool.query(`SELECT * FROM reservas ORDER BY created_at DESC`);
    res.json(reservas);
  } catch (err) {
    res.json([]);
  }
});

app.get('/api/usuarios', async (req, res) => {
  try {
    const usuarios = await pool.query('SELECT id, nombre, email, telefono, created_at FROM usuarios ORDER BY created_at DESC');
    res.json(usuarios);
  } catch (err) {
    res.json([]);
  }
});

// ✅ ADMIN TOKEN VERIFY
app.post('/api/admin/verify', async (req, res) => {
  const { token } = req.body;
  res.json({ valid: token === ADMIN_TOKEN });
});

// ✅ TEST
app.get('/api/test', async (req, res) => {
  try {
    const usersResult = await pool.query('SELECT COUNT(*) as count FROM usuarios');
    const reservasResult = await pool.query('SELECT COUNT(*) as count FROM reservas');
    res.json({ 
      db: 'OK', 
      usuarios: usersResult.rows[0].count,
      reservas: reservasResult.rows[0].count,
      resend: !!process.env.RESEND_API_KEY
    });
  } catch (err) {
    res.json({ db: 'ERROR', error: err.message });
  }
});

// START
async function start() {
  await crearTablas();
  const PORT = process.env.PORT || 3000;
  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Distrito Padel v7.8 COMPLETO en puerto ${PORT}`);
    console.log(`Admin Token: ${ADMIN_TOKEN}`);
  });
}

start().catch(console.error);
