const express = require("express");
const router = express.Router();
const dashboardController = require("../controllers/dashboardController");

router.get("/", dashboardController.getDashboard);
router.post("/saveLocation", dashboardController.saveLocation);

module.exports = router;
