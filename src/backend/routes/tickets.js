const express = require('express');
const router = express.Router();
const ticketController = require('../controllers/ticketController');
const { authMiddleware } = require('../middleware/auth');
const { rules, checkValidation } = require('../middleware/validate');

router.post('/', authMiddleware, rules.createTicket, checkValidation, ticketController.create);
router.get('/:id', authMiddleware, ticketController.getById);

module.exports = router;
