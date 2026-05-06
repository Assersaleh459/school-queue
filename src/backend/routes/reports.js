const express = require('express');
const router = express.Router();
const db = require('../database/db');
const { authMiddleware, requireRole } = require('../middleware/auth');

router.use(authMiddleware, requireRole('super_admin', 'admin'));

router.get('/daily', (req, res) => {
  const date = req.query.date || new Date().toISOString().split('T')[0];
  try {
    const report = db.prepare(`
      SELECT
        d.name        AS department,
        COUNT(*)      AS total_tickets,
        SUM(CASE WHEN t.status = 'completed' THEN 1 ELSE 0 END) AS served,
        SUM(CASE WHEN t.status = 'no_show'   THEN 1 ELSE 0 END) AS no_shows,
        SUM(CASE WHEN t.status = 'skipped'   THEN 1 ELSE 0 END) AS skipped,
        ROUND(AVG(
          CASE WHEN t.called_at IS NOT NULL
            THEN (julianday(t.called_at) - julianday(t.created_at)) * 1440
          END
        ), 1) AS avg_wait_minutes,
        ROUND(AVG(t.service_duration), 1) AS avg_service_minutes
      FROM tickets t
      JOIN departments d ON t.department_id = d.department_id
      WHERE DATE(t.created_at) = ?
      GROUP BY d.department_id, d.name
      ORDER BY d.display_order
    `).all(date);
    res.json(report);
  } catch (error) {
    console.error('Report error:', error);
    res.status(500).json({ error: 'Failed to generate report' });
  }
});

module.exports = router;
