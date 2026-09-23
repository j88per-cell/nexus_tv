const express = require('express');
const db = require('../db');

const router = express.Router();

router.get('/', async (req, res) => {
  const { q, show_name, kind } = req.query;
  const clauses = [];
  const params = [];
  if (q) {
    params.push(`%${q}%`);
    // Plain LIKE, not ILIKE (SQLite has no ILIKE) — SQLite's LIKE is already
    // case-insensitive for ASCII by default, which is what ILIKE gave us on Postgres.
    clauses.push(`title LIKE $${params.length}`);
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
    `SELECT g.id, g.name,
       (SELECT json_group_array(json_object('id', mf.id, 'title', mf.title, 'part_number', mf.part_number))
        FROM (SELECT * FROM media_files WHERE group_id = g.id ORDER BY part_number) mf) AS files
     FROM episode_groups g
     WHERE EXISTS (SELECT 1 FROM media_files WHERE group_id = g.id)
     ORDER BY g.name`
  );
  res.json(rows.map((r) => ({ ...r, files: JSON.parse(r.files) })));
});

router.post('/groups', async (req, res) => {
  const { name, media_file_ids } = req.body;
  if (!name || !Array.isArray(media_file_ids) || media_file_ids.length === 0) {
    return res.status(400).json({ error: 'name and media_file_ids are required' });
  }
  try {
    const groupId = db.transaction(() => {
      const { rows } = db.querySync('INSERT INTO episode_groups (name) VALUES ($1) RETURNING id', [name]);
      const id = rows[0].id;
      media_file_ids.forEach((fileId, i) => {
        db.querySync('UPDATE media_files SET group_id = $1, part_number = $2 WHERE id = $3', [id, i + 1, fileId]);
      });
      return id;
    });
    res.status(201).json({ id: groupId });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.delete('/groups/:id', async (req, res) => {
  await db.query('UPDATE media_files SET group_id = NULL, part_number = NULL WHERE group_id = $1', [req.params.id]);
  await db.query('DELETE FROM episode_groups WHERE id = $1', [req.params.id]);
  res.status(204).end();
});

module.exports = router;
