const express = require('express');
const { getDb } = require('../db/pool');
const { authenticate, authorize } = require('../middleware/auth');

const router = express.Router();

router.get('/', authenticate, async (req, res) => {
  const db = getDb();
  const vehicles = await db.all('SELECT * FROM vehicles ORDER BY plate_number');
  res.json(vehicles);
});

router.post('/', authenticate, authorize('admin'), async (req, res) => {
  const { plate_number, model, driver_name, driver_phone, notes } = req.body;
  if (!plate_number) return res.status(400).json({ error: 'ታርጋ ያስፈልጋል' });
  
  const db = getDb();
  const result = await db.run(
    'INSERT INTO vehicles (plate_number, model, driver_name, driver_phone, notes) VALUES (?, ?, ?, ?, ?)',
    [plate_number, model || '', driver_name || '', driver_phone || '', notes || '']
  );
  
  const newVehicle = await db.get('SELECT * FROM vehicles WHERE id = ?', result.lastID);
  res.status(201).json(newVehicle);
});

router.put('/:id', authenticate, authorize('admin'), async (req, res) => {
  const { plate_number, model, driver_name, driver_phone, status, notes } = req.body;
  const db = getDb();
  
  await db.run(
    'UPDATE vehicles SET plate_number = ?, model = ?, driver_name = ?, driver_phone = ?, status = ?, notes = ? WHERE id = ?',
    [plate_number, model, driver_name, driver_phone, status, notes, req.params.id]
  );
  
  const updated = await db.get('SELECT * FROM vehicles WHERE id = ?', req.params.id);
  res.json(updated);
});

router.delete('/:id', authenticate, authorize('admin'), async (req, res) => {
  const db = getDb();
  await db.run('DELETE FROM vehicles WHERE id = ?', req.params.id);
  res.json({ success: true });
});

module.exports = router;
