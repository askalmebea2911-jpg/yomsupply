const express = require('express');
const { getDb } = require('../db/pool');
const { authenticate } = require('../middleware/auth');

const router = express.Router();

// Add tracking point
router.post('/', authenticate, async (req, res) => {
  const { vehicle_id, latitude, longitude, speed, location_name } = req.body;
  
  if (!latitude || !longitude) {
    return res.status(400).json({ error: 'ኬክሮስ እና ኬንትሮስ ያስፈልጋሉ' });
  }
  
  const db = getDb();
  const result = await db.run(
    'INSERT INTO tracking (vehicle_id, latitude, longitude, speed, location_name) VALUES (?, ?, ?, ?, ?)',
    [vehicle_id || null, latitude, longitude, speed || 0, location_name || '']
  );
  
  res.status(201).json({ id: result.lastID });
});

// Get vehicle tracking
router.get('/vehicle/:vehicle_id', authenticate, async (req, res) => {
  const { limit = 100 } = req.query;
  const db = getDb();
  
  const tracking = await db.all(
    'SELECT * FROM tracking WHERE vehicle_id = ? ORDER BY recorded_at DESC LIMIT ?',
    [req.params.vehicle_id, limit]
  );
  
  res.json(tracking);
});

// Get latest location for all vehicles
router.get('/vehicles/latest', authenticate, async (req, res) => {
  const db = getDb();
  
  const locations = await db.all(`
    SELECT v.id, v.plate_number, v.driver_name, 
           t.latitude, t.longitude, t.location_name, t.recorded_at
    FROM vehicles v
    LEFT JOIN tracking t ON v.id = t.vehicle_id
    WHERE t.id IN (
      SELECT MAX(id) FROM tracking GROUP BY vehicle_id
    ) OR v.status = 'active'
  `);
  
  res.json(locations);
});

module.exports = router;
