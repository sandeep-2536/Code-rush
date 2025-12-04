const express = require('express');
const router = express.Router();
const weatherController = require('../controllers/weatherController');


// The route remains simple, the logic moves to the controller
router.get('/', weatherController.getDashboard);

module.exports = router;