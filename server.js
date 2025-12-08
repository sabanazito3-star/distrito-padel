// server.js - Distrito Padel v7.0 con Postgres Auto-tablas
require('dotenv').config();
const express = require('express');
const bodyParser = require('body-parser');
const cors = require('cors');
const nodemailer = require('nodemailer');
const { Pool } = require('pg');
const { nanoid } = require('nanoid');
const crypto = require('crypto');

const app = express();
app.use(bodyParser.json());
app.use(cors());
app.use(express.static('public'));

// Pool de conexiones Postgres (usa DATABASE_URL de Railway)
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

// ✅ AUTO-CREACIÓN DE TABLAS al iniciar
async function crearTablas() {
  try {
    // Tabla usuarios
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

    // Tabla reservas (con cancelaciones)
    await pool.query(`
      CREATE TABLE IF NOT EXISTS reservas (
        id TEXT PRIMARY KEY,
        usuario_id TEXT REFERENCES usuarios(id),
        nombre TEXT NOT NULL,
        email TEXT NOT NULL,
        telefono TEXT NOT NULL,
        cancha INTEGER NOT NULL CHECK (cancha >= 1 AND cancha <= 4),
        fecha DATE NOT NULL,
        hora_inicio TIME NOT NULL,
        duracion_minutos INTEGER NOT NULL CHECK (duracion_minutos > 0),
        precio_total DECIMAL(10,2) NOT NULL,
        estado TEXT DEFAULT 'pendiente' CHECK (estado IN ('pendiente', 'pagada', 'cancelada')),
        metodo_pago TEXT,
        cancelada_por TEXT CHECK (cancelada_por IN ('usuario', 'admin') OR cancelada_por IS NULL),
        created_at TIMESTAMP DEFAULT NOW()
      )
    `);

    // Tabla promociones
    await pool.query(`
      CREATE TABLE IF NOT EXISTS promociones (
        id TEXT PRIMARY KEY,
        fecha DATE NOT NULL,
        descuento_porcentaje DECIMAL(5,2) CHECK (descuento_porcentaje >= 0 AND descuento_porcentaje <= 100),
        descripcion TEXT,
        created_at TIMESTAMP DEFAULT NOW(),
        UNIQUE(fecha)
      )
    `);

    // Tabla bloqueos
    await pool.query(`
      CREATE TABLE IF NOT EXISTS bloqueos (
        id TEXT PRIMARY KEY,
        cancha INTEGER NOT NULL CHECK (cancha >= 1 AND cancha <= 4),
        fecha DATE NOT NULL,
        hora_inicio TIME NOT NULL,
        duracion_minutos INTEGER NOT NULL,
        motivo TEXT,
        created_at TIMESTAMP DEFAULT NOW()
      )
    `);

    // Índices para rendimiento
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_reservas_fecha_cancha ON reservas (fecha, cancha, estado)`);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_reservas_usuario ON reservas (usuario_id)`);
    
    console.log('✅ Tablas creadas/listas en Postgres');
  } catch (err) {
    console.error('❌ Error creando tablas:', err.message);
  }
}

// ✅ Inicializar tablas al arrancar
(async () => {
  await crearTablas();
  
  const PORT = process.env.PORT || 3000;
  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Servidor en http://localhost:${PORT}`);
  });
})();
