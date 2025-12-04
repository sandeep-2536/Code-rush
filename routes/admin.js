const express = require('express');
const router = express.Router();
const adminController = require('../controllers/adminController');

// Admin authentication
router.get('/login', adminController.getLogin);
router.post('/login', adminController.postLogin);
router.get('/logout', adminController.logout);

// Admin dashboard (protected)
router.get('/dashboard', adminController.checkAuth, adminController.getDashboard);

// Scheme management
router.get('/schemes', adminController.checkAuth, adminController.getSchemes);
router.get('/schemes/add', adminController.checkAuth, adminController.getAddScheme);
router.post('/schemes/add', adminController.checkAuth, adminController.postAddScheme);
router.get('/schemes/edit/:id', adminController.checkAuth, adminController.getEditScheme);
router.post('/schemes/edit/:id', adminController.checkAuth, adminController.postEditScheme);
router.post('/schemes/delete/:id', adminController.checkAuth, adminController.deleteScheme);

module.exports = router;