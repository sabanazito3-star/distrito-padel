// models/Torneo.js
export async function inicializarTablaTorneos(pool) {
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS torneos (
        id TEXT PRIMARY KEY,
        nombre TEXT NOT NULL,
        tipo TEXT NOT NULL,
        descripcion TEXT,
        fecha_inicio DATE NOT NULL,
        fecha_fin DATE,
        hora_inicio TIME,
        precio_inscripcion INTEGER DEFAULT 0,
        max_participantes INTEGER DEFAULT 16,
        min_participantes INTEGER DEFAULT 4,
        canchas INTEGER[],
        estado TEXT DEFAULT 'abierto',
        imagen TEXT,
        reglas TEXT,
        premios TEXT,
        created_at TIMESTAMP DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS torneo_participantes (
        id SERIAL PRIMARY KEY,
        torneo_id TEXT REFERENCES torneos(id) ON DELETE CASCADE,
        email TEXT NOT NULL,
        nombre TEXT NOT NULL,
        pareja_email TEXT,
        pareja_nombre TEXT,
        fecha_inscripcion TIMESTAMP DEFAULT NOW(),
        pagado BOOLEAN DEFAULT FALSE
      );

      CREATE TABLE IF NOT EXISTS torneo_partidos (
        id SERIAL PRIMARY KEY,
        torneo_id TEXT REFERENCES torneos(id) ON DELETE CASCADE,
        ronda TEXT,
        equipo1 TEXT[],
        equipo2 TEXT[],
        resultado TEXT,
        ganador TEXT,
        cancha INTEGER,
        fecha DATE,
        hora TIME
      );
    `);
    console.log('Tablas de torneos inicializadas');
  } catch (err) {
    console.error('Error al crear tablas torneos:', err.message);
  }
}
