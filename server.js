// server.js - Distrito Padel v7.2 ESM + Postgres COMPLETO
import 'dotenv/config';
import express from 'express';
import bodyParser from 'body-parser';
import cors from 'cors';
import nodemailer from 'nodemailer';
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

let config = { precios: { horaDia: 250, horaNoche: 400 } };

// ✅ FUNCIONES PG
async function query(text, params) {
  const result = await pool.query(text, params);
  return result.rows;
}

// ✅ AUTO-CREAR TABLAS COMPLETA
async function crearTablas() {
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS usuarios (
        id TEXT PRIMARY KEY,
        nombre TEXT NOT NULL,
        email TEXT UNIQUE NOT NULL,
        telefono TEXT NOT NULL,
        password TEXT NOT NULL,
        token TEXT UNIQUE NOT NULL,
        created_at TIMESTAMP DEFAULT NOW()
      )
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS reservas (
        id TEXT PRIMARY KEY,
        usuario_id TEXT,
        nombre TEXT NOT NULL,
        email TEXT NOT NULL,
        telefono TEXT NOT NULL,
        cancha INTEGER NOT NULL CHECK (cancha >=1 AND cancha <=4),
        fecha DATE NOT NULL,
        hora_inicio TIME NOT NULL,
        duracion_minutos INTEGER NOT NULL CHECK (duracion_minutos > 0),
        precio_total DECIMAL(10,2) NOT NULL,
        estado TEXT DEFAULT 'pendiente' CHECK (estado IN ('pendiente','pagada','cancelada')),
        metodo_pago TEXT,
        cancelada_por TEXT CHECK (cancelada_por IN ('usuario','admin') OR cancelada_por IS NULL),
        created_at TIMESTAMP DEFAULT NOW()
      )
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS promociones (
        id TEXT PRIMARY KEY,
        fecha DATE NOT NULL,
        descuento_porcentaje DECIMAL(5,2),
        descripcion TEXT,
        created_at TIMESTAMP DEFAULT NOW(),
        UNIQUE(fecha)
      )
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS bloqueos (
        id TEXT PRIMARY KEY,
        cancha INTEGER NOT NULL CHECK (cancha >=1 AND cancha <=4),
        fecha DATE NOT NULL,
        hora_inicio TIME NOT NULL,
        duracion_minutos INTEGER NOT NULL,
        motivo TEXT,
        created_at TIMESTAMP DEFAULT NOW()
      )
    `);

    await pool.query(`CREATE INDEX IF NOT EXISTS idx_reservas_fecha_cancha ON reservas (fecha, cancha, estado)`);
    console.log('✅ Tablas Postgres listas');
  } catch (err) {
    console.error('❌ Error tablas:', err.message);
  }
}

// ✅ REGISTRO
app.post('/api/registro', async (req, res) => {
  try {
    const { nombre, email, telefono, password } = req.body;
    const id = nanoid();
    const token = nanoid();
    const hashedPass = crypto.createHash('sha256').update(password).digest('hex');
    
    await pool.query(
      `INSERT INTO usuarios (id, nombre, email, telefono, password, token) 
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [id, nombre, email, telefono, hashedPass, token]
    );
    
    res.json({ success: true, token });
  } catch (err) {
    console.error('Registro error:', err.message);
    res.status(400).json({ error: 'Email ya existe o error' });
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
    
    if (users.length === 0) {
      return res.status(401).json({ error: 'Credenciales inválidas' });
    }
    
    res.json({ success: true, token: users[0].token, nombre: users[0].nombre });
  } catch (err) {
    console.error('Login error:', err.message);
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
    console.error('Disponibilidad error:', err.message);
    res.json([]);
  }
});

// ✅ RESERVAS
app.post('/api/reservas', async (req, res) => {
  try {
    const reserva = req.body;
    reserva.id = nanoid();
    reserva.estado = 'pendiente';
    
    await pool.query(
      `INSERT INTO reservas 
       (id, nombre, email, telefono, cancha, fecha, hora_inicio, duracion_minutos, precio_total, estado)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
      [reserva.id, reserva.nombre, reserva.email, reserva.telefono, reserva.cancha,
       reserva.fecha, reserva.hora_inicio, reserva.duracion_minutos, reserva.precio_total, reserva.estado]
    );
    
    res.json({ success: true });
  } catch (err) {
    console.error('Reserva error:', err.message);
    res.status(400).json({ error: 'Horario ocupado' });
  }
});

// ✅ ADMIN
app.get('/api/reservas', async (req, res) => {
  try {
    const reservas = await pool.query(`SELECT * FROM reservas ORDER BY fecha, hora_inicio`);
    res.json(reservas);
  } catch (err) {
    res.json([]);
  }
});

app.get('/api/usuarios', async (req, res) => {
  try {
    const usuarios = await pool.query('SELECT id, nombre, email, telefono, created_at FROM usuarios');
    res.json(usuarios);
  } catch (err) {
    res.json([]);
  }
});

// START
async function start() {
  await crearTablas();
  const PORT = process.env.PORT || 3000;
  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Distrito Padel v7.2 COMPLETO en puerto ${PORT}`);
  });
}

start().catch(console.error);
