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

router.get('/transfers', (req, res) => {
  const { from, to, dept_id } = req.query;
  const fromDate = from || new Date().toISOString().split('T')[0];
  const toDate   = to   || fromDate;
  try {
    let query = `
      SELECT
        tr.transfer_id,
        tr.transferred_at,
        tr.reason,
        t.ticket_number,
        t.parent_name,
        t.student_name,
        d_from.name AS from_department,
        d_to.name   AS to_department,
        u.full_name AS transferred_by
      FROM transfers tr
      JOIN tickets t      ON tr.original_ticket_id = t.ticket_id
      JOIN departments d_from ON tr.from_dept_id   = d_from.department_id
      JOIN departments d_to   ON tr.to_dept_id     = d_to.department_id
      LEFT JOIN users u   ON tr.transferred_by     = u.user_id
      WHERE DATE(tr.transferred_at) BETWEEN ? AND ?
    `;
    const params = [fromDate, toDate];
    if (dept_id) { query += ' AND (tr.from_dept_id = ? OR tr.to_dept_id = ?)'; params.push(dept_id, dept_id); }
    query += ' ORDER BY tr.transferred_at DESC';
    res.json(db.prepare(query).all(...params));
  } catch (error) {
    console.error('Transfers report error:', error);
    res.status(500).json({ error: 'Failed to generate transfers report' });
  }
});

router.get('/ticket-log', (req, res) => {
  const { from, to, dept_id, status, search } = req.query;
  const fromDate = from || new Date().toISOString().split('T')[0];
  const toDate   = to   || fromDate;
  try {
    let query = `
      SELECT
        t.ticket_id,
        t.ticket_number,
        t.parent_name,
        t.student_name,
        t.student_id,
        t.phone,
        t.purpose,
        t.priority,
        t.status,
        t.notes,
        t.created_at,
        t.called_at,
        t.completed_at,
        t.service_duration,
        t.call_count,
        d.name  AS department,
        sc.name AS service_type,
        u.full_name AS served_by,
        ROUND(
          CASE
            WHEN t.called_at IS NOT NULL
              THEN (julianday(t.called_at) - julianday(t.created_at)) * 1440
            WHEN t.status = 'waiting'
              THEN (julianday('now') - julianday(t.created_at)) * 1440
            ELSE NULL
          END, 1
        ) AS wait_minutes
      FROM tickets t
      JOIN departments d ON t.department_id = d.department_id
      LEFT JOIN service_categories sc ON t.category_id = sc.category_id
      LEFT JOIN users u ON t.served_by_user_id = u.user_id
      WHERE DATE(t.created_at) BETWEEN ? AND ?
    `;
    const params = [fromDate, toDate];
    if (dept_id) { query += ' AND t.department_id = ?'; params.push(dept_id); }
    if (status && status !== 'all') { query += ' AND t.status = ?'; params.push(status); }
    if (search) {
      query += ' AND (t.ticket_number LIKE ? OR t.parent_name LIKE ? OR t.student_name LIKE ?)';
      const like = `%${search}%`;
      params.push(like, like, like);
    }
    query += ' ORDER BY t.created_at DESC LIMIT 1000';
    res.json(db.prepare(query).all(...params));
  } catch (error) {
    console.error('Ticket log error:', error);
    res.status(500).json({ error: 'Failed to generate ticket log' });
  }
});

router.get('/purposes', (req, res) => {
  const { from, to, dept_id } = req.query;
  const fromDate = from || new Date().toISOString().split('T')[0];
  const toDate   = to   || fromDate;
  try {
    let query = `
      SELECT
        COALESCE(NULLIF(TRIM(t.purpose), ''), '(not specified)') AS purpose,
        d.name AS department,
        COUNT(*) AS total,
        SUM(CASE WHEN t.status = 'completed' THEN 1 ELSE 0 END) AS served
      FROM tickets t
      JOIN departments d ON t.department_id = d.department_id
      WHERE DATE(t.created_at) BETWEEN ? AND ?
    `;
    const params = [fromDate, toDate];
    if (dept_id) { query += ' AND t.department_id = ?'; params.push(dept_id); }
    query += ' GROUP BY purpose, d.department_id ORDER BY total DESC';
    res.json(db.prepare(query).all(...params));
  } catch (error) {
    console.error('Purposes report error:', error);
    res.status(500).json({ error: 'Failed to generate purposes report' });
  }
});

module.exports = router;
