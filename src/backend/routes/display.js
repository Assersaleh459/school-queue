const express = require('express');
const router = express.Router();
const db = require('../database/db');
const { getSetting } = require('../settingsCache');

router.get('/current', (req, res) => {
  try {
    const departments = db.prepare('SELECT * FROM departments WHERE is_active = 1 ORDER BY display_order').all();
    const display_data = {};

    departments.forEach(dept => {
      const current = db.prepare(`
        SELECT t.*, c.name as category_name
        FROM tickets t
        LEFT JOIN service_categories c ON t.category_id = c.category_id
        WHERE t.department_id = ? AND t.status IN ('called', 'serving') AND t.archived = 0
        ORDER BY t.called_at DESC LIMIT 1
      `).get(dept.department_id);

      const next = db.prepare(`
        SELECT * FROM tickets
        WHERE department_id = ? AND status = 'waiting' AND archived = 0
        ORDER BY
          CASE priority WHEN 'urgent' THEN 1 WHEN 'elderly' THEN 2 WHEN 'vip' THEN 3 ELSE 4 END,
          created_at ASC
        LIMIT 1
      `).get(dept.department_id);

      const waiting_count = db.prepare(
        "SELECT COUNT(*) as count FROM tickets WHERE department_id = ? AND status = 'waiting' AND archived = 0"
      ).get(dept.department_id).count;

      display_data[dept.department_id] = {
        current,
        next,
        waiting_count,
        counter: current ? `Counter ${dept.display_order}` : null
      };
    });

    res.json({ departments, display_data, school_name: getSetting('school_name', 'Al-Noor International School') });
  } catch (error) {
    console.error('Display data error:', error);
    res.status(500).json({ error: 'Failed to fetch display data' });
  }
});

module.exports = router;
