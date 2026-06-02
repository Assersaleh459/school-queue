const express = require('express');
const router = express.Router();
const authController = require('../controllers/authController');
const { authMiddleware } = require('../middleware/auth');
const rateLimit = require('express-rate-limit');
const { rules, checkValidation } = require('../middleware/validate');

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  message: { error: 'Too many login attempts. Try again in 15 minutes.' },
  standardHeaders: true,
  legacyHeaders: false,
});

router.post('/login', loginLimiter, rules.login, checkValidation, authController.login);
router.get('/me', authMiddleware, authController.me);
router.put('/change-password', authMiddleware, rules.changePassword, checkValidation, authController.changePassword);

module.exports = router;
