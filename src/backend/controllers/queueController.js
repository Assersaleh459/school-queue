const db = require('../database/db');
const { getSetting } = require('../settingsCache');
const { log } = require('../audit');

exports.getDisplayData = (req, res) => {
  const now_calling = db.prepare(
    `SELECT t.ticket_number, d.name as department_name, d.color_code,
       'Counter ' || d.display_order as counter
     FROM tickets t
     JOIN departments d ON t.department_id = d.department_id
     WHERE t.status = 'called'
     ORDER BY t.called_at DESC`
  ).all();

  const queue_counts = db.prepare(
    `SELECT d.name, d.code, d.color_code,
       COUNT(t.ticket_id) as waiting
     FROM departments d
     LEFT JOIN tickets t ON d.department_id = t.department_id AND t.status = 'waiting'
     WHERE d.is_active = 1
     GROUP BY d.department_id
     ORDER BY d.display_order`
  ).all();

  const announcements = db.prepare(
    'SELECT message_text FROM announcements WHERE is_active = 1 ORDER BY display_order'
  ).all();

  res.json({
    now_calling,
    queue_counts,
    announcements,
    school_name: getSetting('school_name', 'Al-Noor International School')
  });
};

exports.callNext = (req, res) => {
  const { dept_id } = req.params;
  const { staff_id } = req.body;

  try {
    const ticket = db.prepare(`
      SELECT * FROM tickets
      WHERE department_id = ? AND status = 'waiting'
      ORDER BY
        CASE priority
          WHEN 'urgent' THEN 1
          WHEN 'elderly' THEN 2
          WHEN 'vip' THEN 3
          ELSE 4
        END,
        created_at ASC
      LIMIT 1
    `).get(dept_id);

    if (!ticket) {
      return res.status(404).json({ error: 'No waiting tickets' });
    }

    db.prepare(`
      UPDATE tickets SET
        status = 'called',
        called_at = datetime('now'),
        served_by_user_id = ?,
        call_count = call_count + 1
      WHERE ticket_id = ?
    `).run(staff_id, ticket.ticket_id);

    const dept = db.prepare('SELECT * FROM departments WHERE department_id = ?').get(dept_id);

    req.io.to(`dept_${dept_id}`).emit('queue_updated');
    req.io.to('public_monitor').emit('ticket_called', {
      dept_id,
      department_name: dept.name,
      department_name_ar: dept.name_ar || null,
      department_room: dept.room_number || null,
      ticket_number: ticket.ticket_number,
      counter: `Counter ${dept.display_order}`
    });

    log(staff_id, 'TICKET_CALLED', 'ticket', ticket.ticket_id, { ticket_number: ticket.ticket_number, department: dept.name });
    const updatedTicket = db.prepare('SELECT * FROM tickets WHERE ticket_id = ?').get(ticket.ticket_id);
    res.json({ success: true, ticket: updatedTicket });
  } catch (error) {
    console.error('Call next error:', error);
    res.status(500).json({ error: 'Failed to call ticket' });
  }
};

exports.complete = (req, res) => {
  const { ticket_id } = req.params;
  const { notes } = req.body;

  try {
    const ticket = db.prepare('SELECT * FROM tickets WHERE ticket_id = ?').get(ticket_id);
    if (!ticket) return res.status(404).json({ error: 'Ticket not found' });

    const duration = Math.round((Date.now() - new Date(ticket.called_at).getTime()) / 60000);

    db.prepare(`
      UPDATE tickets SET
        status = 'completed',
        completed_at = datetime('now'),
        service_duration = ?,
        notes = ?
      WHERE ticket_id = ?
    `).run(duration, notes, ticket_id);

    req.io.to(`dept_${ticket.department_id}`).emit('queue_updated');
    log(req.user?.user_id, 'TICKET_COMPLETED', 'ticket', ticket_id, { ticket_number: ticket.ticket_number, duration_min: duration });

    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: 'Failed to complete ticket' });
  }
};

exports.recall = (req, res) => {
  const { ticket_id } = req.params;

  try {
    db.prepare('UPDATE tickets SET call_count = call_count + 1 WHERE ticket_id = ?').run(ticket_id);
    const ticket = db.prepare('SELECT * FROM tickets WHERE ticket_id = ?').get(ticket_id);
    const dept = db.prepare('SELECT * FROM departments WHERE department_id = ?').get(ticket.department_id);
    const maxCalls = parseInt(getSetting('no_show_after_calls', '3'));

    req.io.to('public_monitor').emit('ticket_recalled', {
      ticket_number: ticket.ticket_number,
      department_name: dept.name,
      department_name_ar: dept.name_ar || null,
      department_room: dept.room_number || null,
      counter: `Counter ${dept.display_order}`,
      is_final: ticket.call_count >= maxCalls
    });

    log(req.user?.user_id, ticket.call_count >= maxCalls ? 'TICKET_FINAL_CALL' : 'TICKET_RECALLED', 'ticket', ticket.ticket_id, { ticket_number: ticket.ticket_number, call_count: ticket.call_count });
    res.json({ success: true, ticket });
  } catch (error) {
    res.status(500).json({ error: 'Failed to recall ticket' });
  }
};

exports.skip = (req, res) => {
  const { ticket_id } = req.params;
  const { reason } = req.body;

  try {
    db.prepare(`
      UPDATE tickets SET
        status = 'waiting',
        notes = ?,
        call_count = 0,
        called_at = NULL,
        created_at = datetime('now')
      WHERE ticket_id = ?
    `).run(`Skipped: ${reason}`, ticket_id);

    const ticket = db.prepare('SELECT * FROM tickets WHERE ticket_id = ?').get(ticket_id);
    req.io.to(`dept_${ticket.department_id}`).emit('queue_updated');
    log(req.user?.user_id, 'TICKET_SKIPPED', 'ticket', ticket_id, { ticket_number: ticket.ticket_number, reason });

    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: 'Failed to skip ticket' });
  }
};

exports.noShow = (req, res) => {
  const { ticket_id } = req.params;

  try {
    const ticket = db.prepare('SELECT * FROM tickets WHERE ticket_id = ?').get(ticket_id);
    if (!ticket) return res.status(404).json({ error: 'Ticket not found' });

    const row = db.prepare("SELECT setting_value FROM settings WHERE setting_key = 'no_show_after_calls'").get();
    const maxCalls = parseInt(row?.setting_value) || 3;

    if (ticket.call_count < maxCalls) {
      return res.status(400).json({ error: `Must call ${maxCalls} times before no-show` });
    }

    db.prepare(`
      UPDATE tickets SET
        status = 'no_show',
        completed_at = datetime('now')
      WHERE ticket_id = ?
    `).run(ticket_id);

    req.io.to(`dept_${ticket.department_id}`).emit('queue_updated');
    log(req.user?.user_id, 'TICKET_NO_SHOW', 'ticket', ticket_id, { ticket_number: ticket.ticket_number });

    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: 'Failed to mark no-show' });
  }
};

exports.transfer = (req, res) => {
  const { ticket_id } = req.params;
  const { to_dept_id, reason, staff_id } = req.body;

  try {
    const original = db.prepare('SELECT * FROM tickets WHERE ticket_id = ?').get(ticket_id);
    if (!original) return res.status(404).json({ error: 'Ticket not found' });

    const toDept = db.prepare('SELECT * FROM departments WHERE department_id = ?').get(to_dept_id);
    if (!toDept) return res.status(404).json({ error: 'Target department not found' });

    const { generateTicketNumber } = require('./ticketController');
    const newTicketNumber = generateTicketNumber(toDept.code, new Date(), original.priority);

    const result = db.prepare(`
      INSERT INTO tickets (
        ticket_number, department_id, category_id, parent_name, student_name,
        student_id, phone, purpose, priority, status, parent_session_id, transferred_from
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'waiting', ?, ?)
    `).run(
      newTicketNumber, to_dept_id, null, original.parent_name, original.student_name,
      original.student_id, original.phone, `Transfer: ${reason}`, original.priority,
      original.parent_session_id || original.ticket_number, ticket_id
    );

    db.prepare(`
      UPDATE tickets SET
        status = 'transferred',
        completed_at = datetime('now'),
        notes = ?
      WHERE ticket_id = ?
    `).run(`Transferred to ${toDept.name}`, ticket_id);

    db.prepare(`
      INSERT INTO transfers (original_ticket_id, new_ticket_id, from_dept_id, to_dept_id, transferred_by, reason)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(ticket_id, result.lastInsertRowid, original.department_id, to_dept_id, staff_id, reason);

    req.io.to(`dept_${original.department_id}`).emit('queue_updated');
    req.io.to(`dept_${to_dept_id}`).emit('queue_updated');
    log(staff_id, 'TICKET_TRANSFERRED', 'ticket', ticket_id, { from: original.ticket_number, to: newTicketNumber, to_dept: toDept.name, reason });

    res.json({ success: true, new_ticket_number: newTicketNumber });
  } catch (error) {
    console.error('Transfer error:', error);
    res.status(500).json({ error: 'Failed to transfer ticket' });
  }
};
