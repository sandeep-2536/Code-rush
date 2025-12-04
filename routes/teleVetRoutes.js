// routes/teleVetRoutes.js
const express = require("express");
const router = express.Router();
const Vet = require("../models/Vet");
const User = require("../models/User");

// ============================================
// GET: VET DASHBOARD (for vets waiting for calls)
// ============================================
router.get('/doctor/dashboard', (req, res) => {
  const vet = req.session.vet;
  if (!vet) return res.redirect('/vet-auth/login');
  
  console.log('[teleVetRoutes] vet dashboard accessed by:', vet._id);
  res.render('teleVet/vetDashboard', { vet });
});

// ============================================
// GET: FARMER CALL PAGE (to initiate call to specific vet)
// ============================================
router.get('/:vetId/call', async (req, res) => {
  try {
    const farmer = req.session.user;
    if (!farmer) return res.redirect('/auth/login');
    
    const vet = await Vet.findById(req.params.vetId);
    if (!vet) return res.status(404).render('error', { message: 'Vet not found' });
    
    console.log('[teleVetRoutes] farmer call page accessed:', {
      farmerId: farmer._id,
      farmerName: farmer.name,
      vetId: vet._id,
      vetName: vet.name
    });
    
    res.render('teleVet/farmerCall', {
      vet,
      farmer
      // roomId is generated in frontend (teleVetFarmerCall.js)
    });
  } catch (err) {
    console.error('[teleVetRoutes] farmer call page error:', err);
    res.status(500).render('error', { message: 'Server error' });
  }
});

// ============================================
// GET: DOCTOR CALL PAGE (after accepting call from farmer)
// ============================================
router.get('/doctor/call', async (req, res) => {
  try {
    const vet = req.session.vet;
    if (!vet) return res.redirect('/vet-auth/login');
    
    const { roomId, farmerId } = req.query;
    
    // Validate roomId format
    if (!roomId || !roomId.includes('vetroom_')) {
      console.warn('[teleVetRoutes] invalid roomId:', roomId);
      return res.status(400).render('error', { message: 'Invalid room ID' });
    }
    
    // Validate farmerId and fetch farmer
    if (!farmerId) {
      console.warn('[teleVetRoutes] missing farmerId');
      return res.status(400).render('error', { message: 'Farmer ID required' });
    }
    
    const farmer = await User.findById(farmerId);
    if (!farmer) {
      console.warn('[teleVetRoutes] farmer not found:', farmerId);
      return res.status(404).render('error', { message: 'Farmer not found' });
    }
    
    console.log('[teleVetRoutes] doctor call page accessed:', {
      vetId: vet._id,
      vetName: vet.name,
      farmerId: farmer._id,
      farmerName: farmer.name,
      roomId
    });
    
    res.render('teleVet/doctorCall', {
      vet,
      farmer,
      roomId
    });
  } catch (err) {
    console.error('[teleVetRoutes] doctor call page error:', err);
    res.status(500).render('error', { message: 'Server error' });
  }
});

// ============================================
// GET: VET LIST (for farmers to browse and select vet)
// ============================================
router.get('/', async (req, res) => {
  try {
    const farmer = req.session.user;
    if (!farmer) return res.redirect('/auth/login');
    
    const vets = await Vet.find().select('_id name specialization profileImage').lean();
    
    console.log('[teleVetRoutes] vet list accessed, found:', vets.length);
    res.render('teleVet/vetList', { vets, farmer });
  } catch (err) {
    console.error('[teleVetRoutes] vet list error:', err);
    res.status(500).render('error', { message: 'Server error' });
  }
});

// ============================================
// GET: VET PROFILE (view vet details before calling)
// ============================================
router.get('/:vetId', async (req, res) => {
  try {
    const farmer = req.session.user;
    if (!farmer) return res.redirect('/auth/login');
    
    const vet = await Vet.findById(req.params.vetId);
    if (!vet) return res.status(404).render('error', { message: 'Vet not found' });
    
    console.log('[teleVetRoutes] vet profile accessed:', vet._id);
    res.render('teleVet/vetProfile', { vet, farmer });
  } catch (err) {
    console.error('[teleVetRoutes] vet profile error:', err);
    res.status(500).render('error', { message: 'Server error' });
  }
});

module.exports = router;