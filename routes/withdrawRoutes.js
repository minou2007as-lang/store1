const express = require('express');
const { withdrawController } = require('../controllers/withdrawController');

const router = express.Router();

router.post('/withdraws', withdrawController);

module.exports = router;
