const db = require('../database/db');

function generateTicketNumber(dept_code, date, priority) {
  const dateStr = date.toISOString().split('T')[0].replace(/-/g, '');

  const lastTicket = db.prepare(`
    SELECT ticket_number FROM tickets
    WHERE ticket_number LIKE ? AND DATE(created_at) = DATE(?)
    ORDER BY created_at DESC LIMIT 1
  `).get(`${dept_code}-${dateStr}-%`, date.toISOString().split('T')[0]);

  let sequence = 1;
  if (lastTicket) {
    const match = lastTicket.ticket_number.match(/-(\d+)[A-Z]?$/);
    if (match) sequence = parseInt(match[1]) + 1;
  }

  const seqStr = sequence.toString().padStart(3, '0');
  const priorityFlag = priority === 'urgent' ? 'U' : priority === 'elderly' ? 'P' : priority === 'vip' ? 'V' : '';

  return `${dept_code}-${dateStr}-${seqStr}${priorityFlag}`;
}

function calculateWaitTime(dept_id) {
  const queueLength = db.prepare(
    "SELECT COUNT(*) as count FROM tickets WHERE department_id = ? AND status = 'waiting'"
  ).get(dept_id).count;

  const avgServiceTime = db.prepare(`
    SELECT AVG(service_duration) as avg FROM tickets
    WHERE department_id = ? AND status = 'completed'
    AND completed_at >= datetime('now', '-1 day')
    LIMIT 20
  `).get(dept_id).avg || 5;

  const activeStaff = db.prepare(
    'SELECT COUNT(*) as count FROM users WHERE department_id = ? AND is_active = 1'
  ).get(dept_id).count || 1;

  return Math.ceil((queueLength * avgServiceTime) / activeStaff);
}

exports.generateTicketNumber = generateTicketNumber;

const createTicketTx = db.transaction((dept, category_id, parent_name, student_name, student_id, phone, purpose, priority) => {
  const ticket_number = generateTicketNumber(dept.code, new Date(), priority);
  const result = db.prepare(`
    INSERT INTO tickets (
      ticket_number, department_id, category_id, parent_name, student_name,
      student_id, phone, purpose, priority, status
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'waiting')
  `).run(ticket_number, dept.department_id, category_id, parent_name, student_name, student_id, phone, purpose, priority);
  return db.prepare('SELECT * FROM tickets WHERE ticket_id = ?').get(result.lastInsertRowid);
});

exports.create = (req, res) => {
  const { department_id, category_id, parent_name, student_name, student_id, phone, purpose, priority } = req.body;

  try {
    const dept = db.prepare('SELECT * FROM departments WHERE department_id = ?').get(department_id);
    if (!dept) return res.status(404).json({ error: 'Department not found' });

    const estimated_wait = calculateWaitTime(department_id);
    const ticket = createTicketTx(dept, category_id, parent_name, student_name, student_id, phone, purpose, priority || 'regular');

    req.io.to(`dept_${department_id}`).emit('queue_updated');

    res.json({ success: true, ticket: { ...ticket, estimated_wait } });
  } catch (error) {
    console.error('Ticket creation error:', error);
    res.status(500).json({ error: 'Failed to create ticket' });
  }
};

exports.getById = (req, res) => {
  const ticket = db.prepare('SELECT * FROM tickets WHERE ticket_id = ?').get(req.params.id);
  if (!ticket) return res.status(404).json({ error: 'Ticket not found' });
  res.json(ticket);
};
