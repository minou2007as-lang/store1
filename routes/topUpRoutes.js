const express = require('express');
const { topUpController } = require('../controllers/topUpController');

const router = express.Router();

router.post('/topups', topUpController);

module.exports = router;
