const express = require('express');
const router = express.Router();
const queueController = require('../controllers/queueController');
const { authMiddleware } = require('../middleware/auth');

router.get('/display', queueController.getDisplayData);

router.get('/all', authMiddleware, (req, res) => {
  const db = require('../database/db');
  const departments = db.prepare(
    'SELECT * FROM departments WHERE is_active = 1 ORDER BY display_order'
  ).all();

  const result = departments.map(dept => {
    const serving = db.prepare(`
      SELECT t.*, c.name as category_name
      FROM tickets t
      LEFT JOIN service_categories c ON t.category_id = c.category_id
      WHERE t.department_id = ? AND t.status = 'called' AND t.archived = 0
      ORDER BY t.called_at DESC LIMIT 1
    `).get(dept.department_id) || null;

    const waiting = db.prepare(`
      SELECT t.*, c.name as category_name
      FROM tickets t
      LEFT JOIN service_categories c ON t.category_id = c.category_id
      WHERE t.department_id = ? AND t.status = 'waiting' AND t.archived = 0
      ORDER BY
        CASE t.priority WHEN 'urgent' THEN 1 WHEN 'elderly' THEN 2 WHEN 'vip' THEN 3 ELSE 4 END,
        t.created_at ASC
    `).all(dept.department_id);

    const served_today = db.prepare(
      "SELECT COUNT(*) as count FROM tickets WHERE department_id = ? AND DATE(created_at) = DATE('now') AND status = 'completed'"
    ).get(dept.department_id).count;

    return { ...dept, serving, waiting, served_today };
  });

  res.json(result);
});

router.get('/departments/:dept_id/current', authMiddleware, (req, res) => {
  const db = require('../database/db');
  const ticket = db.prepare(`
    SELECT t.*, c.name as category_name
    FROM tickets t
    LEFT JOIN service_categories c ON t.category_id = c.category_id
    WHERE t.department_id = ? AND t.status = 'called' AND t.archived = 0
    ORDER BY t.called_at DESC LIMIT 1
  `).get(req.params.dept_id);
  res.json({ ticket: ticket || null });
});
router.post('/departments/:dept_id/call-next', authMiddleware, queueController.callNext);
router.put('/tickets/:ticket_id/complete', authMiddleware, queueController.complete);
router.put('/tickets/:ticket_id/recall', authMiddleware, queueController.recall);
router.put('/tickets/:ticket_id/skip', authMiddleware, queueController.skip);
router.put('/tickets/:ticket_id/no-show', authMiddleware, queueController.noShow);
router.post('/tickets/:ticket_id/transfer', authMiddleware, queueController.transfer);
router.put('/tickets/:ticket_id/cancel', authMiddleware, queueController.cancel);

module.exports = router;
