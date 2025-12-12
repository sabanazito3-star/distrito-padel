// models/Torneo.js
export async function inicializarTablaTorneos(pool) {
  try {
    await pool.query(`
      -- Tabla principal de torneos
      CREATE TABLE IF NOT EXISTS torneos (
        id TEXT PRIMARY KEY,
        nombre TEXT NOT NULL,
        tipo TEXT NOT NULL, -- 'eliminacion-simple', 'doble-eliminacion', 'round-robin', 'rey-pala', 'relampago', 'americano', 'mixto', 'liga'
        descripcion TEXT,
        fecha_inicio DATE NOT NULL,
        fecha_fin DATE,
        hora_inicio TIME,
        precio_inscripcion INTEGER DEFAULT 0,
        max_participantes INTEGER DEFAULT 16,
        min_participantes INTEGER DEFAULT 4,
        canchas INTEGER[],
        estado TEXT DEFAULT 'abierto', -- 'abierto', 'cerrado', 'en-curso', 'finalizado'
        imagen_base64 TEXT, -- Imagen guardada directamente en base64
        imagen_nombre TEXT, -- Nombre original del archivo
        reglas TEXT,
        premios TEXT,
        bracket_generado BOOLEAN DEFAULT FALSE,
        duracion_partidos INTEGER DEFAULT 90, -- Minutos por partido
        formato_sets TEXT DEFAULT '2/3', -- '2/3' = mejor de 3 sets, '1/1' = 1 set
        puntos_victoria INTEGER DEFAULT 3, -- Para torneos tipo liga
        puntos_empate INTEGER DEFAULT 1,
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW()
      );

      -- Tabla de participantes
      CREATE TABLE IF NOT EXISTS torneo_participantes (
        id SERIAL PRIMARY KEY,
        torneo_id TEXT REFERENCES torneos(id) ON DELETE CASCADE,
        email TEXT NOT NULL,
        nombre TEXT NOT NULL,
        pareja_email TEXT,
        pareja_nombre TEXT,
        nivel TEXT, -- 'principiante', 'intermedio', 'avanzado', 'profesional'
        posicion INTEGER, -- Para ordenar bracket
        puntos INTEGER DEFAULT 0, -- Para torneos tipo liga/round-robin
        partidos_ganados INTEGER DEFAULT 0,
        partidos_perdidos INTEGER DEFAULT 0,
        sets_favor INTEGER DEFAULT 0,
        sets_contra INTEGER DEFAULT 0,
        fecha_inscripcion TIMESTAMP DEFAULT NOW(),
        pagado BOOLEAN DEFAULT FALSE,
        eliminado BOOLEAN DEFAULT FALSE,
        UNIQUE(torneo_id, email)
      );

      -- Tabla de partidos/encuentros
      CREATE TABLE IF NOT EXISTS torneo_partidos (
        id SERIAL PRIMARY KEY,
        torneo_id TEXT REFERENCES torneos(id) ON DELETE CASCADE,
        ronda TEXT NOT NULL, -- 'final', 'semifinal', 'cuartos', 'octavos', 'grupo-A', 'fecha-1', etc
        numero_partido INTEGER, -- Orden dentro de la ronda
        equipo1_email1 TEXT, -- Email jugador 1 del equipo 1
        equipo1_email2 TEXT, -- Email jugador 2 del equipo 1 (NULL para individuales)
        equipo2_email1 TEXT,
        equipo2_email2 TEXT,
        equipo1_nombres TEXT[], -- Array con nombres para mostrar
        equipo2_nombres TEXT[],
        resultado_equipo1 INTEGER, -- Sets ganados por equipo 1
        resultado_equipo2 INTEGER, -- Sets ganados por equipo 2
        sets_detalle JSONB, -- Ej: [{"eq1": 6, "eq2": 4}, {"eq1": 7, "eq2": 5}]
        ganador TEXT, -- 'equipo1' o 'equipo2'
        ganador_emails TEXT[], -- Emails de los ganadores
        estado TEXT DEFAULT 'pendiente', -- 'pendiente', 'en-juego', 'finalizado', 'w.o.'
        cancha INTEGER,
        fecha DATE,
        hora TIME,
        proximo_partido_id INTEGER, -- ID del partido al que avanza el ganador
        es_final_superior BOOLEAN DEFAULT FALSE, -- Para doble eliminación (bracket superior)
        es_final_inferior BOOLEAN DEFAULT FALSE, -- Para doble eliminación (bracket inferior)
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW()
      );

      -- Tabla para bracket de doble eliminación
      CREATE TABLE IF NOT EXISTS torneo_bracket_doble (
        id SERIAL PRIMARY KEY,
        torneo_id TEXT REFERENCES torneos(id) ON DELETE CASCADE,
        tipo_bracket TEXT NOT NULL, -- 'superior' o 'inferior'
        partido_id INTEGER REFERENCES torneo_partidos(id) ON DELETE CASCADE,
        posicion_x INTEGER, -- Coordenada X para renderizar
        posicion_y INTEGER, -- Coordenada Y para renderizar
        nivel INTEGER -- Nivel en el árbol (0=final, 1=semi, etc)
      );

      -- Tabla para estadísticas de jugadores en el torneo
      CREATE TABLE IF NOT EXISTS torneo_estadisticas (
        id SERIAL PRIMARY KEY,
        torneo_id TEXT REFERENCES torneos(id) ON DELETE CASCADE,
        email TEXT NOT NULL,
        aces INTEGER DEFAULT 0,
        dobles_faltas INTEGER DEFAULT 0,
        winners INTEGER DEFAULT 0,
        errores_no_forzados INTEGER DEFAULT 0,
        puntos_totales INTEGER DEFAULT 0,
        UNIQUE(torneo_id, email)
      );

      -- Índices para mejorar performance
      CREATE INDEX IF NOT EXISTS idx_torneos_estado ON torneos(estado);
      CREATE INDEX IF NOT EXISTS idx_torneos_fecha ON torneos(fecha_inicio);
      CREATE INDEX IF NOT EXISTS idx_participantes_torneo ON torneo_participantes(torneo_id);
      CREATE INDEX IF NOT EXISTS idx_partidos_torneo ON torneo_partidos(torneo_id);
      CREATE INDEX IF NOT EXISTS idx_partidos_ronda ON torneo_partidos(torneo_id, ronda);
    `);
    
    console.log('✅ Tablas de torneos completas inicializadas');
  } catch (err) {
    console.error('❌ Error al crear tablas torneos:', err.message);
  }
}

// Tipos de torneos disponibles
export const TIPOS_TORNEO = {
  ELIMINACION_SIMPLE: 'eliminacion-simple',
  DOBLE_ELIMINACION: 'doble-eliminacion',
  ROUND_ROBIN: 'round-robin',
  REY_PALA: 'rey-pala',
  RELAMPAGO: 'relampago',
  AMERICANO: 'americano',
  MIXTO: 'mixto',
  LIGA: 'liga'
};

// Configuraciones por defecto según tipo
export const CONFIG_TORNEO = {
  [TIPOS_TORNEO.ELIMINACION_SIMPLE]: {
    nombre: 'Eliminación Simple',
    descripcion: 'Sistema de eliminación directa. Pierdes y sales del torneo.',
    participantes_ideales: [4, 8, 16, 32],
    requiere_pareja: true,
    formato_sets: '2/3'
  },
  [TIPOS_TORNEO.DOBLE_ELIMINACION]: {
    nombre: 'Doble Eliminación',
    descripcion: 'Pierdes dos veces y quedas eliminado. Segunda oportunidad.',
    participantes_ideales: [4, 8, 16],
    requiere_pareja: true,
    formato_sets: '2/3'
  },
  [TIPOS_TORNEO.ROUND_ROBIN]: {
    nombre: 'Round Robin (Todos contra Todos)',
    descripcion: 'Todos juegan contra todos. Gana quien más partidos gane.',
    participantes_ideales: [4, 6, 8],
    requiere_pareja: true,
    formato_sets: '2/3'
  },
  [TIPOS_TORNEO.REY_PALA]: {
    nombre: 'Rey de la Pala',
    descripcion: 'Partidos rápidos rotativos. Cada 10 min cambian parejas y rivales.',
    participantes_ideales: [8, 12, 16],
    requiere_pareja: false,
    formato_sets: '1/1',
    duracion_partido: 10
  },
  [TIPOS_TORNEO.RELAMPAGO]: {
    nombre: 'Relámpago',
    descripcion: 'Partidos express de 15-20 minutos. Eliminación directa rápida.',
    participantes_ideales: [8, 16],
    requiere_pareja: true,
    formato_sets: '1/1',
    duracion_partido: 20
  },
  [TIPOS_TORNEO.AMERICANO]: {
    nombre: 'Americano',
    descripcion: 'Sistema rotativo donde cambias de pareja cada partido.',
    participantes_ideales: [4, 8, 12],
    requiere_pareja: false,
    formato_sets: '1/1'
  },
  [TIPOS_TORNEO.MIXTO]: {
    nombre: 'Torneo Mixto',
    descripcion: 'Parejas obligatorias de hombre-mujer.',
    participantes_ideales: [8, 16],
    requiere_pareja: true,
    formato_sets: '2/3',
    requiere_genero: true
  },
  [TIPOS_TORNEO.LIGA]: {
    nombre: 'Liga',
    descripcion: 'Sistema de puntos por jornadas. Tabla de posiciones.',
    participantes_ideales: [6, 8, 10, 12],
    requiere_pareja: true,
    formato_sets: '2/3',
    puntos_victoria: 3,
    puntos_empate: 1
  }
};
