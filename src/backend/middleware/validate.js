const { body, param, validationResult } = require('express-validator');

// Stops chain on first error in each field
const v = (chain) => chain.bail();

function checkValidation(req, res, next) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(422).json({ error: errors.array()[0].msg });
  }
  next();
}

const VALID_ROLES     = ['super_admin', 'admin', 'staff', 'reception'];
const VALID_PRIORITY  = ['regular', 'urgent', 'elderly', 'vip'];
const VALID_LANG      = ['en', 'ar', 'both'];

const rules = {
  login: [
    v(body('username').trim().notEmpty().withMessage('Username is required')),
    v(body('password').notEmpty().withMessage('Password is required')),
  ],

  changePassword: [
    v(body('current_password').notEmpty().withMessage('Current password is required')),
    v(body('new_password').isLength({ min: 8 }).withMessage('New password must be at least 8 characters')),
  ],

  createUser: [
    v(body('username').trim().isLength({ min: 3, max: 50 }).withMessage('Username must be 3–50 characters')),
    v(body('password').isLength({ min: 8 }).withMessage('Password must be at least 8 characters')),
    v(body('full_name').trim().notEmpty().withMessage('Full name is required')),
    v(body('role').isIn(VALID_ROLES).withMessage('Invalid role')),
  ],

  updateUser: [
    v(body('full_name').trim().notEmpty().withMessage('Full name is required')),
    v(body('role').isIn(VALID_ROLES).withMessage('Invalid role')),
  ],

  createDepartment: [
    v(body('name').trim().notEmpty().withMessage('Department name is required')),
    v(body('code').trim().isAlphanumeric().isLength({ min: 1, max: 10 }).withMessage('Code must be 1–10 alphanumeric characters')),
  ],

  updateDepartment: [
    v(body('name').trim().notEmpty().withMessage('Department name is required')),
    v(body('code').trim().isAlphanumeric().isLength({ min: 1, max: 10 }).withMessage('Code must be 1–10 alphanumeric characters')),
  ],

  createAnnouncement: [
    v(body('message_text').trim().notEmpty().withMessage('Message text is required')),
    v(body('speak_language').optional().isIn(VALID_LANG).withMessage('Invalid language')),
  ],

  updateAnnouncement: [
    v(body('message_text').trim().notEmpty().withMessage('Message text is required')),
    v(body('speak_language').optional().isIn(VALID_LANG).withMessage('Invalid language')),
  ],

  createTicket: [
    v(body('department_id').isInt({ min: 1 }).withMessage('Valid department is required')),
    v(body('priority').optional().isIn(VALID_PRIORITY).withMessage('Invalid priority')),
    v(body('parent_name').optional().trim().isLength({ max: 100 }).withMessage('Parent name too long')),
    v(body('student_name').optional().trim().isLength({ max: 100 }).withMessage('Student name too long')),
    v(body('phone').optional().trim().isLength({ max: 20 }).withMessage('Phone number too long')),
  ],
};

module.exports = { rules, checkValidation };
