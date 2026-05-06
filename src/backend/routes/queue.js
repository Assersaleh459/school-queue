const express = require('express');
const router = express.Router();
const queueController = require('../controllers/queueController');
const { authMiddleware } = require('../middleware/auth');

router.get('/display', queueController.getDisplayData);

router.get('/departments/:dept_id/current', authMiddleware, (req, res) => {
  const db = require('../database/db');
  const ticket = db.prepare(`
    SELECT t.*, c.name as category_name
    FROM tickets t
    LEFT JOIN service_categories c ON t.category_id = c.category_id
    WHERE t.department_id = ? AND t.status = 'called'
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

module.exports = router;
