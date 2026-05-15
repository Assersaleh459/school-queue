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

router.get('/service-types', (req, res) => {
  const { from, to, department_id } = req.query;
  const fromDate = from || new Date().toISOString().split('T')[0];
  const toDate   = to   || fromDate;
  try {
    let query = `
      SELECT
        sc.category_id,
        sc.name              AS service_type,
        sc.estimated_time_minutes,
        d.name               AS department,
        d.department_id,
        COUNT(*)             AS total_tickets,
        SUM(CASE WHEN t.status = 'completed' THEN 1 ELSE 0 END) AS served,
        SUM(CASE WHEN t.status = 'no_show'   THEN 1 ELSE 0 END) AS no_shows,
        ROUND(AVG(
          CASE WHEN t.called_at IS NOT NULL
            THEN (julianday(t.called_at) - julianday(t.created_at)) * 1440
          END
        ), 1) AS avg_wait_minutes,
        ROUND(AVG(
          CASE WHEN t.status = 'completed' AND t.service_duration IS NOT NULL
            THEN t.service_duration END
        ), 1) AS avg_actual_minutes
      FROM tickets t
      JOIN service_categories sc ON t.category_id = sc.category_id
      JOIN departments d ON t.department_id = d.department_id
      WHERE DATE(t.created_at) BETWEEN ? AND ?
    `;
    const params = [fromDate, toDate];
    if (department_id) { query += ' AND t.department_id = ?'; params.push(department_id); }
    query += ' GROUP BY t.category_id ORDER BY total_tickets DESC';
    res.json(db.prepare(query).all(...params));
  } catch (error) {
    console.error('Service type report error:', error);
    res.status(500).json({ error: 'Failed to generate service type report' });
  }
});

router.get('/category-stats', (req, res) => {
  try {
    const stats = db.prepare(`
      SELECT
        sc.category_id,
        sc.name,
        sc.estimated_time_minutes,
        ROUND(AVG(
          CASE WHEN t.service_duration IS NOT NULL THEN t.service_duration END
        ), 0) AS actual_avg_minutes,
        COUNT(t.ticket_id) AS sample_count
      FROM service_categories sc
      LEFT JOIN tickets t ON t.category_id = sc.category_id
        AND t.status = 'completed'
        AND t.service_duration IS NOT NULL
        AND DATE(t.completed_at) >= DATE('now', '-30 days')
      GROUP BY sc.category_id
    `).all();
    res.json(stats);
  } catch (error) {
    console.error('Category stats error:', error);
    res.status(500).json({ error: 'Failed to fetch category stats' });
  }
});

module.exports = router;
