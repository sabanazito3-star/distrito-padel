// server.js - Distrito Padel v7.0 ESM + Postgres Auto-tablas
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

// Pool Postgres (Railway DATABASE_URL)
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

// ✅ AUTO-CREACIÓN TABLAS
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
        usuario_id TEXT REFERENCES usuarios(id),
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
        descuento_porcentaje DECIMAL(5,2) CHECK (descuento_porcentaje >=0 AND descuento_porcentaje <=100),
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
    console.log('✅ Tablas Postgres creadas/listas');
  } catch (err) {
    console.error('❌ Error creando tablas:', err.message);
  }
}

// Iniciar servidor
async function start() {
  await crearTablas();
  const PORT = process.env.PORT || 3000;
  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Servidor Distrito Padel v7.0 en puerto ${PORT}`);
  });
}

start().catch(console.error);
