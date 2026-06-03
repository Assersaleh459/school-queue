const express = require('express');
const router = express.Router();
const db = require('../database/db');
const { log } = require('../audit');
const { createTicketTx, calculateWaitTime } = require('../controllers/ticketController');

router.post('/ticket', (req, res) => {
  const { department_id, category_id, parent_name, student_name } = req.body;

  if (!parent_name?.trim()) return res.status(422).json({ error: 'Parent name is required' });
  if (!department_id) return res.status(422).json({ error: 'Please select a department' });

  try {
    const dept = db.prepare('SELECT * FROM departments WHERE department_id = ? AND is_active = 1').get(department_id);
    if (!dept) return res.status(404).json({ error: 'Department not found' });

    const cat_id = category_id ? parseInt(category_id) || null : null;
    const estimated_wait = calculateWaitTime(department_id);
    const ticket = createTicketTx(dept, cat_id, parent_name.trim(), student_name?.trim() || null, null, null, null, 'regular');

    req.io.to(`dept_${department_id}`).emit('queue_updated');
    log(null, 'KIOSK_TICKET_CREATED', 'ticket', ticket.ticket_id, {
      ticket_number: ticket.ticket_number,
      department: dept.name,
    });

    res.json({ success: true, ticket: { ...ticket, estimated_wait } });
  } catch (error) {
    console.error('Kiosk ticket error:', error);
    res.status(500).json({ error: error.message || 'Failed to create ticket' });
  }
});

module.exports = router;
