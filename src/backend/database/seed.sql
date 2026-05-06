INSERT OR IGNORE INTO departments VALUES
(1, 'Administration', 'ADM', '#19224A', 1, 1, datetime('now')),
(2, 'Accounting', 'ACC', '#5FAEB6', 2, 1, datetime('now')),
(3, 'Student Relations', 'STR', '#223B73', 3, 1, datetime('now'));

INSERT OR IGNORE INTO service_categories VALUES
(1, 1, 'Document Request', 10, 1),
(2, 1, 'Complaint', 15, 1),
(3, 1, 'General Inquiry', 5, 1),
(4, 2, 'Tuition Payment', 5, 1),
(5, 2, 'Fee Inquiry', 3, 1),
(6, 2, 'Financial Aid', 10, 1),
(7, 3, 'Enrollment', 20, 1),
(8, 3, 'Transcript Request', 8, 1),
(9, 3, 'Academic Counseling', 15, 1);

INSERT OR IGNORE INTO settings VALUES
('school_name', 'Al-Noor International School', 'string'),
('primary_color', '#19224A', 'string'),
('secondary_color', '#5FAEB6', 'string'),
('working_hours_start', '08:00', 'string'),
('working_hours_end', '15:00', 'string'),
('ticket_format', '{DEPT}-{DATE}-{SEQ}', 'string'),
('sequence_reset', 'daily', 'string'),
('max_wait_alert_minutes', '30', 'number'),
('no_show_after_calls', '3', 'number'),
('audio_enabled', 'true', 'boolean'),
('audio_volume', '80', 'number'),
('monitor_layout', '3-column', 'string');

INSERT OR IGNORE INTO announcements VALUES
(1, 'School hours: 8 AM - 3 PM | Welcome to our queue system', NULL, 1, 1);
