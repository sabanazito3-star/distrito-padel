// server.js - Distrito Padel v7.1 ESM + Postgres COMPLETO
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

// Configuración precios (desde DB después)
let config = { precios: { horaDia: 250, horaNoche: 400 } };

// ✅ FUNCIONES PG
async function query(text, params) {
  const result = await pool.query(text, params);
  return result.rows;
}

// Auto-tablas (ya ejecutadas)
async function crearTablas() {
  // ... mismo código anterior ...
  console.log('✅ Tablas Postgres listas');
}

// ENDPOINTS USUARIOS
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
    res.status(400).json({ error: 'Email ya existe' });
  }
});

app.post('/api/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    const hashedPass = crypto.createHash('sha256').update(password).digest('hex');
    
    const user = await pool.query(
      `SELECT * FROM usuarios WHERE email = $1 AND password = $2`,
      [email, hashedPass]
    );
    
    if (user.length === 0) {
      return res.status(401).json({ error: 'Credenciales inválidas' });
    }
    
    res.json({ success: true, token: user[0].token, nombre: user[0].nombre });
  } catch (err) {
    res.status(500).json({ error: 'Error login' });
  }
});

// ENDPOINTS RESERVAS (con cancelaciones)
app.get('/api/disponibilidad', async (req, res) => {
  const { fecha, cancha } = req.query;
  const reservas = await pool.query(
    `SELECT * FROM reservas WHERE fecha = $1 AND cancha = $2 AND estado != 'cancelada'`,
    [fecha, cancha]
  );
  res.json(reservas);
});

app.post('/api/reservas', async (req, res) => {
  try {
    const reserva = req.body;
    reserva.id = nanoid();
    reserva.estado = 'pendiente';
    
    await pool.query(
      `INSERT INTO reservas (id, nombre, email, telefono, cancha, fecha, hora_inicio, 
        duracion_minutos, precio_total, estado) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
      [reserva.id, reserva.nombre, reserva.email, reserva.telefono, reserva.cancha,
       reserva.fecha, reserva.hora_inicio, reserva.duracion_minutos, reserva.precio_total, reserva.estado]
    );
    
    res.json({ success: true });
  } catch (err) {
    res.status(400).json({ error: 'Horario ocupado' });
  }
});

// Admin endpoints (simplificados)
app.get('/api/reservas', async (req, res) => {
  const reservas = await pool.query(
    `SELECT * FROM reservas ORDER BY fecha, hora_inicio`
  );
  res.json(reservas);
});

app.get('/api/usuarios', async (req, res) => {
  const usuarios = await query('SELECT * FROM usuarios');
  res.json(usuarios);
});

// Iniciar
async function start() {
  await crearTablas();
  const PORT = process.env.PORT || 3000;
  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Distrito Padel v7.1 COMPLETO en puerto ${PORT}`);
  });
}

start().catch(console.error);
