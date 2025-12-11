// routes/torneos.js
import { nanoid } from 'nanoid';
import { pool } from '../server.js';

export default function(app) {
  
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
              'fecha_inscripcion', tp.fecha_inscripcion
            )
          ) FILTER (WHERE tp.id IS NOT NULL), '[]') as participantes
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

  // GET torneo específico
  app.get('/api/torneos/:id', async (req, res) => {
    try {
      const torneo = await pool.query(`
        SELECT t.*, 
          COALESCE(json_agg(
            json_build_object(
              'email', tp.email,
              'nombre', tp.nombre,
              'pareja_email', tp.pareja_email,
              'pareja_nombre', tp.pareja_nombre,
              'pagado', tp.pagado
            )
          ) FILTER (WHERE tp.id IS NOT NULL), '[]') as participantes,
          COALESCE(
            (SELECT json_agg(
              json_build_object(
                'id', tpa.id,
                'ronda', tpa.ronda,
                'equipo1', tpa.equipo1,
                'equipo2', tpa.equipo2,
                'resultado', tpa.resultado,
                'ganador', tpa.ganador,
                'cancha', tpa.cancha,
                'fecha', tpa.fecha,
                'hora', tpa.hora
              )
            ) FROM torneo_partidos tpa WHERE tpa.torneo_id = t.id), '[]'
          ) as partidos
        FROM torneos t
        LEFT JOIN torneo_participantes tp ON t.id = tp.torneo_id
        WHERE t.id = $1
        GROUP BY t.id
      `, [req.params.id]);
      
      if (torneo.rows.length === 0) {
        return res.status(404).json({ ok: false, msg: 'Torneo no encontrado' });
      }
      
      res.json(torneo.rows[0]);
    } catch (err) {
      console.error('Error GET torneo:', err);
      res.status(500).json({ ok: false, msg: 'Error al obtener torneo' });
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
      const { pareja_email } = req.body;

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
        INSERT INTO torneo_participantes (torneo_id, email, nombre, pareja_email, pareja_nombre, pagado)
        VALUES ($1, $2, $3, $4, $5, false)
      `, [req.params.id, usuario.email, usuario.nombre, parejaData.email, parejaData.nombre]);

      res.json({ ok: true, msg: 'Inscripción exitosa' });
    } catch (err) {
      console.error('Error inscribir torneo:', err);
      res.status(500).json({ ok: false, msg: 'Error al inscribirse' });
    }
  });

  // DELETE cancelar inscripción
  app.delete('/api/torneos/:id/inscripcion', async (req, res) => {
    try {
      const token = req.headers['x-token'];
      if (!token) {
        return res.status(401).json({ ok: false, msg: 'No autorizado' });
      }

      const user = await pool.query('SELECT * FROM usuarios WHERE token = $1', [token]);
      if (user.rows.length === 0) {
        return res.status(401).json({ ok: false, msg: 'Token inválido' });
      }

      await pool.query(
        'DELETE FROM torneo_participantes WHERE torneo_id = $1 AND email = $2',
        [req.params.id, user.rows[0].email]
      );

      res.json({ ok: true, msg: 'Inscripción cancelada' });
    } catch (err) {
      console.error('Error cancelar inscripción:', err);
      res.status(500).json({ ok: false, msg: 'Error al cancelar' });
    }
  });

  // ==================== ADMIN ====================

  // POST crear torneo (ADMIN)
  app.post('/api/admin/torneos', async (req, res) => {
    try {
      const adminToken = req.headers['x-admin-token'];
      if (adminToken !== process.env.ADMIN_TOKEN && adminToken !== 'distritoadmin23') {
        return res.status(403).json({ ok: false, msg: 'No autorizado' });
      }

      const {
        nombre, tipo, descripcion, fecha_inicio, fecha_fin, hora_inicio,
        precio_inscripcion, max_participantes, min_participantes, canchas,
        imagen, reglas, premios
      } = req.body;

      const id = nanoid();
      
      await pool.query(`
        INSERT INTO torneos (
          id, nombre, tipo, descripcion, fecha_inicio, fecha_fin, hora_inicio,
          precio_inscripcion, max_participantes, min_participantes, canchas,
          imagen, reglas, premios, estado
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, 'abierto')
      `, [
        id, nombre, tipo, descripcion, fecha_inicio, fecha_fin || null, hora_inicio || null,
        precio_inscripcion || 0, max_participantes || 16, min_participantes || 4,
        canchas || [1, 2, 3], imagen || null, reglas || null, premios || null
      ]);

      res.json({ ok: true, msg: 'Torneo creado', torneoId: id });
    } catch (err) {
      console.error('Error crear torneo:', err);
      res.status(500).json({ ok: false, msg: 'Error al crear torneo' });
    }
  });

  // PUT actualizar torneo (ADMIN)
  app.put('/api/admin/torneos/:id', async (req, res) => {
    try {
      const adminToken = req.headers['x-admin-token'];
      if (adminToken !== process.env.ADMIN_TOKEN && adminToken !== 'distritoadmin23') {
        return res.status(403).json({ ok: false, msg: 'No autorizado' });
      }

      const {
        nombre, tipo, descripcion, fecha_inicio, fecha_fin, hora_inicio,
        precio_inscripcion, max_participantes, min_participantes, estado,
        imagen, reglas, premios
      } = req.body;

      await pool.query(`
        UPDATE torneos SET
          nombre = COALESCE($1, nombre),
          tipo = COALESCE($2, tipo),
          descripcion = COALESCE($3, descripcion),
          fecha_inicio = COALESCE($4, fecha_inicio),
          fecha_fin = COALESCE($5, fecha_fin),
          hora_inicio = COALESCE($6, hora_inicio),
          precio_inscripcion = COALESCE($7, precio_inscripcion),
          max_participantes = COALESCE($8, max_participantes),
          min_participantes = COALESCE($9, min_participantes),
          estado = COALESCE($10, estado),
          imagen = COALESCE($11, imagen),
          reglas = COALESCE($12, reglas),
          premios = COALESCE($13, premios)
        WHERE id = $14
      `, [
        nombre, tipo, descripcion, fecha_inicio, fecha_fin, hora_inicio,
        precio_inscripcion, max_participantes, min_participantes, estado,
        imagen, reglas, premios, req.params.id
      ]);

      res.json({ ok: true, msg: 'Torneo actualizado' });
    } catch (err) {
      console.error('Error actualizar torneo:', err);
      res.status(500).json({ ok: false, msg: 'Error al actualizar' });
    }
  });

  // DELETE eliminar torneo (ADMIN)
  app.delete('/api/admin/torneos/:id', async (req, res) => {
    try {
      const adminToken = req.headers['x-admin-token'];
      if (adminToken !== process.env.ADMIN_TOKEN && adminToken !== 'distritoadmin23') {
        return res.status(403).json({ ok: false, msg: 'No autorizado' });
      }

      await pool.query('DELETE FROM torneos WHERE id = $1', [req.params.id]);

      res.json({ ok: true, msg: 'Torneo eliminado' });
    } catch (err) {
      console.error('Error eliminar torneo:', err);
      res.status(500).json({ ok: false, msg: 'Error al eliminar' });
    }
  });

  // PATCH marcar participante como pagado (ADMIN)
  app.patch('/api/admin/torneos/:torneoId/participantes/:email/pagar', async (req, res) => {
    try {
      const adminToken = req.headers['x-admin-token'];
      if (adminToken !== process.env.ADMIN_TOKEN && adminToken !== 'distritoadmin23') {
        return res.status(403).json({ ok: false, msg: 'No autorizado' });
      }

      await pool.query(`
        UPDATE torneo_participantes 
        SET pagado = true 
        WHERE torneo_id = $1 AND email = $2
      `, [req.params.torneoId, req.params.email]);

      res.json({ ok: true, msg: 'Marcado como pagado' });
    } catch (err) {
      console.error('Error marcar pagado:', err);
      res.status(500).json({ ok: false, msg: 'Error' });
    }
  });

  // POST registrar resultado de partido (ADMIN)
  app.post('/api/admin/torneos/:id/resultado', async (req, res) => {
    try {
      const adminToken = req.headers['x-admin-token'];
      if (adminToken !== process.env.ADMIN_TOKEN && adminToken !== 'distritoadmin23') {
        return res.status(403).json({ ok: false, msg: 'No autorizado' });
      }

      const { partido_id, resultado, ganador } = req.body;

      await pool.query(`
        UPDATE torneo_partidos 
        SET resultado = $1, ganador = $2 
        WHERE id = $3
      `, [resultado, ganador, partido_id]);

      res.json({ ok: true, msg: 'Resultado registrado' });
    } catch (err) {
      console.error('Error registrar resultado:', err);
      res.status(500).json({ ok: false, msg: 'Error' });
    }
  });

  // GET todos los torneos (ADMIN)
  app.get('/api/admin/torneos', async (req, res) => {
    try {
      const adminToken = req.headers['x-admin-token'];
      if (adminToken !== process.env.ADMIN_TOKEN && adminToken !== 'distritoadmin23') {
        return res.status(403).json({ ok: false, msg: 'No autorizado' });
      }

      const result = await pool.query(`
        SELECT t.*, 
          (SELECT COUNT(*) FROM torneo_participantes WHERE torneo_id = t.id) as total_participantes
        FROM torneos t
        ORDER BY t.created_at DESC
      `);
      
      res.json(result.rows);
    } catch (err) {
      console.error('Error GET admin torneos:', err);
      res.status(500).json({ ok: false, msg: 'Error' });
    }
  });

}
