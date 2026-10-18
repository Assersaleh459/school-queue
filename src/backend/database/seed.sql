-- First start of a new install: settings only. The school adds its own departments,
-- services and announcements; the admin user is created in db.js.
INSERT OR IGNORE INTO settings VALUES
('school_name', 'My School', 'string'),
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
