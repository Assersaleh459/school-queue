CREATE TABLE IF NOT EXISTS users (
  user_id INTEGER PRIMARY KEY AUTOINCREMENT,
  username VARCHAR(50) UNIQUE NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  full_name VARCHAR(100) NOT NULL,
  role VARCHAR(20) NOT NULL,
  department_id INTEGER,
  is_active BOOLEAN DEFAULT 1,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  last_login TIMESTAMP
);

CREATE TABLE IF NOT EXISTS departments (
  department_id INTEGER PRIMARY KEY AUTOINCREMENT,
  name VARCHAR(100) NOT NULL,
  code VARCHAR(10) UNIQUE NOT NULL,
  color_code VARCHAR(7) DEFAULT '#19224A',
  display_order INTEGER,
  is_active BOOLEAN DEFAULT 1,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS service_categories (
  category_id INTEGER PRIMARY KEY AUTOINCREMENT,
  department_id INTEGER NOT NULL,
  name VARCHAR(100) NOT NULL,
  estimated_time_minutes INTEGER DEFAULT 5,
  is_active BOOLEAN DEFAULT 1,
  FOREIGN KEY (department_id) REFERENCES departments(department_id)
);

CREATE TABLE IF NOT EXISTS tickets (
  ticket_id INTEGER PRIMARY KEY AUTOINCREMENT,
  ticket_number VARCHAR(50) UNIQUE NOT NULL,
  department_id INTEGER NOT NULL,
  category_id INTEGER,
  parent_name VARCHAR(100) NOT NULL,
  student_name VARCHAR(100),
  student_id VARCHAR(50),
  phone VARCHAR(20),
  purpose TEXT,
  priority VARCHAR(20) DEFAULT 'regular',
  status VARCHAR(20) DEFAULT 'waiting',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  called_at TIMESTAMP,
  completed_at TIMESTAMP,
  service_duration INTEGER,
  served_by_user_id INTEGER,
  notes TEXT,
  parent_session_id VARCHAR(50),
  transferred_from INTEGER,
  call_count INTEGER DEFAULT 0,
  archived INTEGER DEFAULT 0,
  FOREIGN KEY (department_id) REFERENCES departments(department_id),
  FOREIGN KEY (category_id) REFERENCES service_categories(category_id),
  FOREIGN KEY (served_by_user_id) REFERENCES users(user_id)
);

CREATE TABLE IF NOT EXISTS transfers (
  transfer_id INTEGER PRIMARY KEY AUTOINCREMENT,
  original_ticket_id INTEGER NOT NULL,
  new_ticket_id INTEGER NOT NULL,
  from_dept_id INTEGER NOT NULL,
  to_dept_id INTEGER NOT NULL,
  transferred_by INTEGER,
  reason TEXT,
  transferred_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS settings (
  setting_key VARCHAR(50) PRIMARY KEY,
  setting_value TEXT NOT NULL,
  setting_type VARCHAR(20) DEFAULT 'string'
);

CREATE TABLE IF NOT EXISTS announcements (
  announcement_id INTEGER PRIMARY KEY AUTOINCREMENT,
  message_text TEXT NOT NULL,
  message_text_ar TEXT,
  is_active BOOLEAN DEFAULT 1,
  display_order INTEGER
);

CREATE TABLE IF NOT EXISTS audit_logs (
  log_id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER,
  action VARCHAR(100) NOT NULL,
  entity_type VARCHAR(50),
  entity_id INTEGER,
  details TEXT,
  logged_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_tickets_dept_status   ON tickets(department_id, status);
CREATE INDEX IF NOT EXISTS idx_tickets_created        ON tickets(created_at);
CREATE INDEX IF NOT EXISTS idx_tickets_number         ON tickets(ticket_number);
CREATE INDEX IF NOT EXISTS idx_tickets_completed_at   ON tickets(completed_at);
CREATE INDEX IF NOT EXISTS idx_tickets_served_by      ON tickets(served_by_user_id);
CREATE INDEX IF NOT EXISTS idx_tickets_category       ON tickets(category_id);
CREATE INDEX IF NOT EXISTS idx_audit_logged_at        ON audit_logs(logged_at);
CREATE INDEX IF NOT EXISTS idx_audit_user             ON audit_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_users_dept             ON users(department_id);
CREATE INDEX IF NOT EXISTS idx_users_active           ON users(is_active);
