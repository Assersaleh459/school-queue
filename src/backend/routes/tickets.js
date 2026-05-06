const express = require('express');
const router = express.Router();
const ticketController = require('../controllers/ticketController');
const { authMiddleware } = require('../middleware/auth');

router.post('/', authMiddleware, ticketController.create);
router.get('/:id', authMiddleware, ticketController.getById);

module.exports = router;
