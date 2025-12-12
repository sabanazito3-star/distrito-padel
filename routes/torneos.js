// routes/torneos.js
import { nanoid } from 'nanoid';

// ==================== FUNCIONES AUXILIARES ====================

// Función para generar bracket de eliminación simple
function generarBracketEliminacionSimple(participantes) {
  const n = participantes.length;
  const rondas = Math.ceil(Math.log2(n));
  const partidos = [];

  // Determinar nombres de rondas
  const nombresRondas = {
    1: 'Final',
    2: 'Semifinal',
    3: 'Cuartos de Final',
    4: 'Octavos de Final',
    5: 'Dieciseisavos de Final'
  };

  let rondaActual = rondas;
  let equiposActuales = [...participantes];

  // Generar primera ronda
  for (let i = 0; i < equiposActuales.length; i += 2) {
    if (i + 1 < equiposActuales.length) {
      partidos.push({
        ronda: nombresRondas[rondaActual] || `Ronda ${rondaActual}`,
        numero_partido: Math.floor(i / 2) + 1,
        equipo1: equiposActuales[i],
        equipo2: equiposActuales[i + 1]
      });
    }
  }

  return partidos;
}

// Función para generar bracket round robin
function generarBracketRoundRobin(participantes) {
  const partidos = [];
  const n = participantes.length;

  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      partidos.push({
        ronda: 'Todos contra Todos',
        numero_partido: partidos.length + 1,
        equipo1: participantes[i],
        equipo2: participantes[j]
      });
    }
  }

  return partidos;
}

// Función para generar bracket americano
function generarBracketAmericano(participantes, numRondas = 3) {
  const partidos = [];
  const n = participantes.length;

  for (let ronda = 1; ronda <= numRondas; ronda++) {
    // Rotación de parejas
    const equipos = [];
    for (let i = 0; i < n; i += 2) {
      const idx1 = (i + ronda - 1) % n;
      const idx2 = (i + 1 + ronda - 1) % n;
      equipos.push([participantes[idx1], participantes[idx2]]);
    }

    // Generar partidos de la ronda
    for (let i = 0; i < equipos.length; i += 2) {
      if (i + 1 < equipos.length) {
        partidos.push({
          ronda: `Ronda ${ronda}`,
          numero_partido: Math.floor(i / 2) + 1,
          equipo1: equipos[i],
          equipo2: equipos[i + 1]
        });
      }
    }
  }

  return partidos;
}

// Función para generar bracket rey de la pala
function generarBracketReyPala(participantes, numRondas = 5) {
  const partidos = [];
  const n = participantes.length;

  for (let ronda = 1; ronda <= numRondas; ronda++) {
    // Parejas aleatorias cada ronda
    const shuffled = [...participantes].sort(() => Math.random() - 0.5);
    for (let i = 0; i < n; i += 4) {
      if (i + 3 < n) {
        partidos.push({
          ronda: `Ronda ${ronda}`,
          numero_partido: Math.floor(i / 4) + 1,
          equipo1: [shuffled[i], shuffled[i + 1]],
          equipo2: [shuffled[i + 2], shuffled[i + 3]]
        });
      }
    }
  }

  return partidos;
}

// ==================== MIDDLEWARE ====================

function verificarAdmin(req, res, next) {
  const token = req.headers['x-admin-token'];
  if (!token || token !== process.env.ADMIN_TOKEN) {
    return res.status(401).json({ ok: false, msg: 'No autorizado' });
  }
  next();
}

// ==================== ENDPOINTS PÚBLICOS ====================

export default function(app, pool) {

  // GET todos los torneos
  app.get('/api/torneos', async (req, res) => {
    try {
      const result = await pool.query(`
        SELECT t.*,
          COALESCE(json_agg(
            json_build_object(
              'email', tp.email,
              'nombre', tp.nombre,
              'pareja_email', tp.pareja_email,
              'pareja_nombre', tp.pareja_nombre,
              'pagado', tp.pagado,
              'nivel', tp.nivel,
              'fecha_inscripcion', tp.fecha_inscripcion
            )
          ) FILTER (WHERE tp.id IS NOT NULL), '[]') as participantes,
          (SELECT COUNT(*) FROM torneo_participantes WHERE torneo_id = t.id) as total_inscritos
        FROM torneos t
        LEFT JOIN torneo_participantes tp ON t.id = tp.torneo_id
        GROUP BY t.id
        ORDER BY t.fecha_inicio ASC
      `);
      res.json(result.rows);
    } catch (err) {
      console.error('Error GET torneos:', err);
      res.status(500).json({ ok: false, msg: 'Error al obtener torneos' });
    }
  });

  // GET torneo específico CON BRACKET
  app.get('/api/torneos/:id', async (req, res) => {
    try {
      const torneo = await pool.query(`
        SELECT t.*,
          COALESCE(json_agg(
            DISTINCT jsonb_build_object(
              'email', tp.email,
              'nombre', tp.nombre,
              'pareja_email', tp.pareja_email,
              'pareja_nombre', tp.pareja_nombre,
              'pagado', tp.pagado,
              'nivel', tp.nivel,
              'puntos', tp.puntos,
              'partidos_ganados', tp.partidos_ganados,
              'partidos_perdidos', tp.partidos_perdidos
            )
          ) FILTER (WHERE tp.id IS NOT NULL), '[]') as participantes
        FROM torneos t
        LEFT JOIN torneo_participantes tp ON t.id = tp.torneo_id
        WHERE t.id = $1
        GROUP BY t.id
      `, [req.params.id]);

      if (torneo.rows.length === 0) {
        return res.status(404).json({ ok: false, msg: 'Torneo no encontrado' });
      }

      // Obtener partidos
      const partidos = await pool.query(`
        SELECT * FROM torneo_partidos
        WHERE torneo_id = $1
        ORDER BY
          CASE ronda
            WHEN 'Final' THEN 1
            WHEN 'Semifinal' THEN 2
            WHEN 'Cuartos de Final' THEN 3
            WHEN 'Octavos de Final' THEN 4
            ELSE 5
          END,
          numero_partido
      `, [req.params.id]);

      const data = torneo.rows[0];
      data.partidos = partidos.rows;
      res.json(data);
    } catch (err) {
      console.error('Error GET torneo:', err);
      res.status(500).json({ ok: false, msg: 'Error al obtener torneo' });
    }
  });

  // GET bracket visual formateado
  app.get('/api/torneos/:id/bracket', async (req, res) => {
    try {
      const partidos = await pool.query(`
        SELECT * FROM torneo_partidos
        WHERE torneo_id = $1
        ORDER BY
          CASE ronda
            WHEN 'Final' THEN 1
            WHEN 'Semifinal' THEN 2
            WHEN 'Cuartos de Final' THEN 3
            WHEN 'Octavos de Final' THEN 4
            ELSE 5
          END,
          numero_partido
      `, [req.params.id]);

      // Organizar por rondas
      const bracket = {};
      partidos.rows.forEach(p => {
        if (!bracket[p.ronda]) bracket[p.ronda] = [];
        bracket[p.ronda].push(p);
      });

      res.json({ bracket, partidos: partidos.rows });
    } catch (err) {
      console.error('Error GET bracket:', err);
      res.status(500).json({ ok: false, msg: 'Error al obtener bracket' });
    }
  });

  // GET tabla de posiciones (para torneos tipo liga/round-robin)
  app.get('/api/torneos/:id/tabla', async (req, res) => {
    try {
      const tabla = await pool.query(`
        SELECT
          nombre, email, pareja_nombre,
          puntos, partidos_ganados, partidos_perdidos,
          sets_favor, sets_contra,
          (sets_favor - sets_contra) as diferencia_sets
        FROM torneo_participantes
        WHERE torneo_id = $1
        ORDER BY puntos DESC, diferencia_sets DESC, sets_favor DESC
      `, [req.params.id]);

      res.json(tabla.rows);
    } catch (err) {
      console.error('Error GET tabla:', err);
      res.status(500).json({ ok: false, msg: 'Error' });
    }
  });

  // POST inscribirse a torneo
  app.post('/api/torneos/:id/inscribir', async (req, res) => {
    try {
      const token = req.headers['x-token'];
      if (!token) {
        return res.status(401).json({ ok: false, msg: 'No autorizado' });
      }

      const user = await pool.query('SELECT * FROM usuarios WHERE token = $1', [token]);
      if (user.rows.length === 0) {
        return res.status(401).json({ ok: false, msg: 'Token inválido' });
      }

      const usuario = user.rows[0];
      const { pareja_email, nivel } = req.body;

      const torneo = await pool.query('SELECT * FROM torneos WHERE id = $1', [req.params.id]);
      if (torneo.rows.length === 0) {
        return res.status(404).json({ ok: false, msg: 'Torneo no encontrado' });
      }

      const t = torneo.rows[0];
      if (t.estado !== 'abierto') {
        return res.status(400).json({ ok: false, msg: 'Inscripciones cerradas' });
      }

      const participantes = await pool.query(
        'SELECT COUNT(*) as total FROM torneo_participantes WHERE torneo_id = $1',
        [req.params.id]
      );

      if (parseInt(participantes.rows[0].total) >= t.max_participantes) {
        return res.status(400).json({ ok: false, msg: 'Torneo lleno' });
      }

      const yaInscrito = await pool.query(
        'SELECT * FROM torneo_participantes WHERE torneo_id = $1 AND email = $2',
        [req.params.id, usuario.email]
      );

      if (yaInscrito.rows.length > 0) {
        return res.status(400).json({ ok: false, msg: 'Ya estás inscrito' });
      }

      let parejaData = { email: null, nombre: null };
      if (pareja_email) {
        const pareja = await pool.query('SELECT * FROM usuarios WHERE email = $1', [pareja_email]);
        if (pareja.rows.length === 0) {
          return res.status(404).json({ ok: false, msg: 'Pareja no encontrada' });
        }
        parejaData = { email: pareja.rows[0].email, nombre: pareja.rows[0].nombre };
      }

      await pool.query(`
        INSERT INTO torneo_participantes (
          torneo_id, email, nombre, pareja_email, pareja_nombre, nivel, pagado
        ) VALUES ($1, $2, $3, $4, $5, $6, false)
      `, [
        req.params.id,
        usuario.email,
        usuario.nombre,
        parejaData.email,
        parejaData.nombre,
        nivel || 'intermedio'
      ]);

      res.json({ ok: true, msg: 'Inscripción exitosa' });
    } catch (err) {
      console.error('Error inscribir:', err);
      res.status(500).json({ ok: false, msg: 'Error al inscribirse' });
    }
  });

  // ==================== ENDPOINTS ADMIN ====================

  // POST crear torneo (ADMIN)
  app.post('/api/admin/torneos', verificarAdmin, async (req, res) => {
    try {
      const {
        nombre,
        tipo,
        descripcion,
        fecha_inicio,
        fecha_fin,
        hora_inicio,
        precio_inscripcion,
        max_participantes,
        min_participantes,
        canchas,
        reglas,
        premios,
        imagen_base64,
        imagen_nombre
      } = req.body;

      const id = nanoid();

      await pool.query(`
        INSERT INTO torneos (
          id, nombre, tipo, descripcion, fecha_inicio, fecha_fin, hora_inicio,
          precio_inscripcion, max_participantes, min_participantes, canchas,
          reglas, premios, imagen_base64, imagen_nombre, estado
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, 'abierto')
      `, [
        id, nombre, tipo, descripcion, fecha_inicio, fecha_fin || null, hora_inicio || null,
        precio_inscripcion || 0, max_participantes || 16, min_participantes || 4,
        canchas || [], reglas || '', premios || '', imagen_base64 || null, imagen_nombre || null
      ]);

      res.json({ ok: true, id, msg: 'Torneo creado exitosamente' });
    } catch (err) {
      console.error('Error crear torneo:', err);
      res.status(500).json({ ok: false, msg: 'Error al crear torneo: ' + err.message });
    }
  });

  // PUT actualizar torneo (ADMIN)
  app.put('/api/admin/torneos/:id', verificarAdmin, async (req, res) => {
    try {
      const {
        nombre,
        tipo,
        descripcion,
        fecha_inicio,
        fecha_fin,
        hora_inicio,
        precio_inscripcion,
        max_participantes,
        min_participantes,
        canchas,
        reglas,
        premios,
        imagen_base64,
        imagen_nombre
      } = req.body;

      await pool.query(`
        UPDATE torneos SET
          nombre = $1,
          tipo = $2,
          descripcion = $3,
          fecha_inicio = $4,
          fecha_fin = $5,
          hora_inicio = $6,
          precio_inscripcion = $7,
          max_participantes = $8,
          min_participantes = $9,
          canchas = $10,
          reglas = $11,
          premios = $12,
          imagen_base64 = $13,
          imagen_nombre = $14,
          updated_at = NOW()
        WHERE id = $15
      `, [
        nombre, tipo, descripcion, fecha_inicio, fecha_fin, hora_inicio,
        precio_inscripcion, max_participantes, min_participantes, canchas,
        reglas, premios, imagen_base64, imagen_nombre, req.params.id
      ]);

      res.json({ ok: true, msg: 'Torneo actualizado' });
    } catch (err) {
      console.error('Error actualizar torneo:', err);
      res.status(500).json({ ok: false, msg: 'Error al actualizar' });
    }
  });

  // DELETE eliminar torneo (ADMIN)
  app.delete('/api/admin/torneos/:id', verificarAdmin, async (req, res) => {
    try {
      await pool.query('DELETE FROM torneos WHERE id = $1', [req.params.id]);
      res.json({ ok: true, msg: 'Torneo eliminado' });
    } catch (err) {
      console.error('Error eliminar torneo:', err);
      res.status(500).json({ ok: false, msg: 'Error al eliminar' });
    }
  });

  // PATCH cambiar estado de torneo (ADMIN)
  app.patch('/api/admin/torneos/:id/estado', verificarAdmin, async (req, res) => {
    try {
      const { estado } = req.body;

      if (!['abierto', 'cerrado', 'en-curso', 'finalizado'].includes(estado)) {
        return res.status(400).json({ ok: false, msg: 'Estado inválido' });
      }

      await pool.query(
        'UPDATE torneos SET estado = $1, updated_at = NOW() WHERE id = $2',
        [estado, req.params.id]
      );

      res.json({ ok: true, msg: 'Estado actualizado' });
    } catch (err) {
      console.error('Error cambiar estado:', err);
      res.status(500).json({ ok: false, msg: 'Error' });
    }
  });

  // POST generar bracket (ADMIN) - CORREGIDO
  app.post('/api/admin/torneos/:id/generar-bracket', verificarAdmin, async (req, res) => {
    try {
      const torneo = await pool.query('SELECT * FROM torneos WHERE id = $1', [req.params.id]);

      if (torneo.rows.length === 0) {
        return res.status(404).json({ ok: false, msg: 'Torneo no encontrado' });
      }

      const t = torneo.rows[0];

      // Obtener participantes
      const participantes = await pool.query(
        'SELECT * FROM torneo_participantes WHERE torneo_id = $1 ORDER BY fecha_inscripcion',
        [req.params.id]
      );

      if (participantes.rows.length < t.min_participantes) {
        return res.status(400).json({
          ok: false,
          msg: `Mínimo ${t.min_participantes} participantes requeridos`
        });
      }

      // Limpiar partidos anteriores si existen
      await pool.query('DELETE FROM torneo_partidos WHERE torneo_id = $1', [req.params.id]);

      const parts = participantes.rows;
      let partidos = [];

      // Generar bracket según tipo
      switch (t.tipo) {
        case 'eliminacion-simple':
        case 'relampago':
        case 'mixto':
          partidos = generarBracketEliminacionSimple(parts);
          break;
        case 'round-robin':
        case 'liga':
          partidos = generarBracketRoundRobin(parts);
          break;
        case 'americano':
          partidos = generarBracketAmericano(parts, 4);
          break;
        case 'rey-pala':
          partidos = generarBracketReyPala(parts, 5);
          break;
        default:
          partidos = generarBracketEliminacionSimple(parts);
      }

      // Insertar partidos en BD - CORREGIDO
      for (const p of partidos) {
        // Convertir a array si no lo es
        const eq1 = Array.isArray(p.equipo1) ? p.equipo1 : [p.equipo1];
        const eq2 = Array.isArray(p.equipo2) ? p.equipo2 : [p.equipo2];

        // Filtrar nulls y extraer datos
        const eq1Clean = eq1.filter(e => e && e.nombre);
        const eq2Clean = eq2.filter(e => e && e.nombre);

        // Arrays de nombres
        const eq1Nombres = eq1Clean.map(e => e.nombre);
        const eq2Nombres = eq2Clean.map(e => e.nombre);

        // Usar sintaxis correcta de PostgreSQL para arrays
        await pool.query(`
          INSERT INTO torneo_partidos (
            torneo_id, ronda, numero_partido,
            equipo1_email1, equipo1_email2, equipo2_email1, equipo2_email2,
            equipo1_nombres, equipo2_nombres, estado
          )
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8::text[], $9::text[], 'pendiente')
        `, [
          req.params.id,
          p.ronda,
          p.numero_partido,
          eq1Clean[0]?.email || null,
          eq1Clean[1]?.email || null,
          eq2Clean[0]?.email || null,
          eq2Clean[1]?.email || null,
          eq1Nombres,
          eq2Nombres
        ]);
      }

      // Marcar bracket como generado
      await pool.query(
        'UPDATE torneos SET bracket_generado = true, estado = $1, updated_at = NOW() WHERE id = $2',
        ['en-curso', req.params.id]
      );

      res.json({ ok: true, msg: 'Bracket generado exitosamente', total_partidos: partidos.length });
    } catch (err) {
      console.error('Error generar bracket:', err);
      res.status(500).json({ ok: false, msg: 'Error al generar bracket: ' + err.message });
    }
  });

  // POST registrar resultado detallado (ADMIN)
  app.post('/api/admin/torneos/:id/resultado', verificarAdmin, async (req, res) => {
    try {
      const {
        partido_id,
        resultado_equipo1,
        resultado_equipo2,
        sets_detalle,
        ganador,
        cancha,
        fecha,
        hora
      } = req.body;

      // Actualizar partido
      await pool.query(`
        UPDATE torneo_partidos
        SET
          resultado_equipo1 = $1,
          resultado_equipo2 = $2,
          sets_detalle = $3,
          ganador = $4,
          estado = 'finalizado',
          cancha = $5,
          fecha = $6,
          hora = $7,
          updated_at = NOW()
        WHERE id = $8
      `, [
        resultado_equipo1,
        resultado_equipo2,
        JSON.stringify(sets_detalle),
        ganador,
        cancha,
        fecha,
        hora,
        partido_id
      ]);

      // Actualizar estadísticas de participantes
      const partido = await pool.query('SELECT * FROM torneo_partidos WHERE id = $1', [partido_id]);
      const p = partido.rows[0];

      if (ganador === 'equipo1') {
        // Equipo 1 gana
        if (p.equipo1_email1) {
          await pool.query(`
            UPDATE torneo_participantes
            SET partidos_ganados = partidos_ganados + 1,
                sets_favor = sets_favor + $1,
                sets_contra = sets_contra + $2,
                puntos = puntos + 3
            WHERE torneo_id = $3 AND email = $4
          `, [resultado_equipo1, resultado_equipo2, req.params.id, p.equipo1_email1]);
        }

        if (p.equipo1_email2) {
          await pool.query(`
            UPDATE torneo_participantes
            SET partidos_ganados = partidos_ganados + 1,
                sets_favor = sets_favor + $1,
                sets_contra = sets_contra + $2,
                puntos = puntos + 3
            WHERE torneo_id = $3 AND email = $4
          `, [resultado_equipo1, resultado_equipo2, req.params.id, p.equipo1_email2]);
        }

        // Equipo 2 pierde
        if (p.equipo2_email1) {
          await pool.query(`
            UPDATE torneo_participantes
            SET partidos_perdidos = partidos_perdidos + 1,
                sets_favor = sets_favor + $1,
                sets_contra = sets_contra + $2
            WHERE torneo_id = $3 AND email = $4
          `, [resultado_equipo2, resultado_equipo1, req.params.id, p.equipo2_email1]);
        }

        if (p.equipo2_email2) {
          await pool.query(`
            UPDATE torneo_participantes
            SET partidos_perdidos = partidos_perdidos + 1,
                sets_favor = sets_favor + $1,
                sets_contra = sets_contra + $2
            WHERE torneo_id = $3 AND email = $4
          `, [resultado_equipo2, resultado_equipo1, req.params.id, p.equipo2_email2]);
        }
      } else if (ganador === 'equipo2') {
        // Equipo 2 gana (viceversa)
        if (p.equipo2_email1) {
          await pool.query(`
            UPDATE torneo_participantes
            SET partidos_ganados = partidos_ganados + 1,
                sets_favor = sets_favor + $1,
                sets_contra = sets_contra + $2,
                puntos = puntos + 3
            WHERE torneo_id = $3 AND email = $4
          `, [resultado_equipo2, resultado_equipo1, req.params.id, p.equipo2_email1]);
        }

        if (p.equipo2_email2) {
          await pool.query(`
            UPDATE torneo_participantes
            SET partidos_ganados = partidos_ganados + 1,
                sets_favor = sets_favor + $1,
                sets_contra = sets_contra + $2,
                puntos = puntos + 3
            WHERE torneo_id = $3 AND email = $4
          `, [resultado_equipo2, resultado_equipo1, req.params.id, p.equipo2_email2]);
        }

        if (p.equipo1_email1) {
          await pool.query(`
            UPDATE torneo_participantes
            SET partidos_perdidos = partidos_perdidos + 1,
                sets_favor = sets_favor + $1,
                sets_contra = sets_contra + $2
            WHERE torneo_id = $3 AND email = $4
          `, [resultado_equipo1, resultado_equipo2, req.params.id, p.equipo1_email1]);
        }

        if (p.equipo1_email2) {
          await pool.query(`
            UPDATE torneo_participantes
            SET partidos_perdidos = partidos_perdidos + 1,
                sets_favor = sets_favor + $1,
                sets_contra = sets_contra + $2
            WHERE torneo_id = $3 AND email = $4
          `, [resultado_equipo1, resultado_equipo2, req.params.id, p.equipo1_email2]);
        }
      }

      res.json({ ok: true, msg: 'Resultado registrado' });
    } catch (err) {
      console.error('Error registrar resultado:', err);
      res.status(500).json({ ok: false, msg: 'Error' });
    }
  });

  // PATCH marcar pago de participante (ADMIN)
  app.patch('/api/admin/torneos/:id/participantes/:email/pago', verificarAdmin, async (req, res) => {
    try {
      const { pagado } = req.body;

      await pool.query(
        'UPDATE torneo_participantes SET pagado = $1 WHERE torneo_id = $2 AND email = $3',
        [pagado, req.params.id, req.params.email]
      );

      res.json({ ok: true, msg: 'Estado de pago actualizado' });
    } catch (err) {
      console.error('Error actualizar pago:', err);
      res.status(500).json({ ok: false, msg: 'Error' });
    }
  });

  // DELETE eliminar participante (ADMIN)
  app.delete('/api/admin/torneos/:id/participantes/:email', verificarAdmin, async (req, res) => {
    try {
      await pool.query(
        'DELETE FROM torneo_participantes WHERE torneo_id = $1 AND email = $2',
        [req.params.id, req.params.email]
      );

      res.json({ ok: true, msg: 'Participante eliminado' });
    } catch (err) {
      console.error('Error eliminar participante:', err);
      res.status(500).json({ ok: false, msg: 'Error' });
    }
  });

}