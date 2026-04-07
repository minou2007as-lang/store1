const express = require('express');
const { createOrderController } = require('../controllers/orderController');

const router = express.Router();

router.post('/orders', createOrderController);

module.exports = router;
