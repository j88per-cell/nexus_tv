const express = require('express');
const db = require('../db');

const router = express.Router();

router.get('/', async (req, res) => {
  const { q, show_name, kind } = req.query;
  const clauses = [];
  const params = [];
  if (q) {
    params.push(`%${q}%`);
    clauses.push(`title ILIKE $${params.length}`);
  }
  if (show_name) {
    params.push(show_name);
    clauses.push(`show_name = $${params.length}`);
  }
  if (kind) {
    params.push(kind);
    clauses.push(`kind = $${params.length}`);
  }
  const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
  const { rows } = await db.query(
    `SELECT * FROM media_files ${where} ORDER BY show_name NULLS LAST, season NULLS LAST, episode NULLS LAST, title LIMIT 500`,
    params
  );
  res.json(rows);
});

router.get('/shows', async (req, res) => {
  const { rows } = await db.query(
    `SELECT show_name, count(*) AS episode_count
     FROM media_files WHERE kind = 'episode' AND show_name IS NOT NULL
     GROUP BY show_name ORDER BY show_name`
  );
  res.json(rows);
});

router.get('/groups', async (req, res) => {
  const { rows } = await db.query(
    `SELECT g.id, g.name, json_agg(json_build_object('id', mf.id, 'title', mf.title, 'part_number', mf.part_number) ORDER BY mf.part_number) AS files
     FROM episode_groups g JOIN media_files mf ON mf.group_id = g.id
     GROUP BY g.id, g.name ORDER BY g.name`
  );
  res.json(rows);
});

router.post('/groups', async (req, res) => {
  const { name, media_file_ids } = req.body;
  if (!name || !Array.isArray(media_file_ids) || media_file_ids.length === 0) {
    return res.status(400).json({ error: 'name and media_file_ids are required' });
  }
  const client = await db.pool.connect();
  try {
    await client.query('BEGIN');
    const { rows } = await client.query('INSERT INTO episode_groups (name) VALUES ($1) RETURNING id', [name]);
    const groupId = rows[0].id;
    for (let i = 0; i < media_file_ids.length; i += 1) {
      await client.query('UPDATE media_files SET group_id = $1, part_number = $2 WHERE id = $3', [
        groupId,
        i + 1,
        media_file_ids[i],
      ]);
    }
    await client.query('COMMIT');
    res.status(201).json({ id: groupId });
  } catch (err) {
    await client.query('ROLLBACK');
    res.status(500).json({ error: err.message });
  } finally {
    client.release();
  }
});

router.delete('/groups/:id', async (req, res) => {
  await db.query('UPDATE media_files SET group_id = NULL, part_number = NULL WHERE group_id = $1', [req.params.id]);
  await db.query('DELETE FROM episode_groups WHERE id = $1', [req.params.id]);
  res.status(204).end();
});

module.exports = router;
