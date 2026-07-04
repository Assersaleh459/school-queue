const express = require('express');
const router = express.Router();
const db = require('../database/db');

router.get('/', (req, res) => {
  const departments = db.prepare('SELECT * FROM departments WHERE is_active = 1 ORDER BY display_order').all();
  res.json(departments);
});

router.get('/:id/categories', (req, res) => {
  const categories = db.prepare(
    'SELECT * FROM service_categories WHERE department_id = ? AND is_active = 1'
  ).all(req.params.id);
  res.json(categories);
});

router.get('/:id/queue', (req, res) => {
  const tickets = db.prepare(`
    SELECT
      t.*,
      c.name as category_name
    FROM tickets t
    LEFT JOIN service_categories c ON t.category_id = c.category_id
    WHERE t.department_id = ? AND t.status = 'waiting' AND t.archived = 0
    ORDER BY
      CASE t.priority
        WHEN 'urgent' THEN 1
        WHEN 'elderly' THEN 2
        WHEN 'vip' THEN 3
        ELSE 4
      END,
      t.created_at ASC
  `).all(req.params.id);

  res.json(tickets);
});

router.get('/:id/stats', (req, res) => {
  const waiting_count = db.prepare(
    "SELECT COUNT(*) as count FROM tickets WHERE department_id = ? AND status = 'waiting' AND archived = 0"
  ).get(req.params.id).count;

  const serving_count = db.prepare(
    "SELECT COUNT(*) as count FROM tickets WHERE department_id = ? AND status IN ('called', 'serving') AND archived = 0"
  ).get(req.params.id).count;

  const served_today = db.prepare(
    "SELECT COUNT(*) as count FROM tickets WHERE department_id = ? AND DATE(created_at) = DATE('now') AND status = 'completed'"
  ).get(req.params.id).count;

  res.json({ waiting_count, serving_count, served_today });
});

module.exports = router;
