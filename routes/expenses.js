const express = require('express');
const { getDb } = require('../db/pool');
const { authenticate } = require('../middleware/auth');

const router = express.Router();

router.get('/', authenticate, async (req, res) => {
  const db = getDb();
  const expenses = await db.all(`
    SELECT e.*, v.plate_number as vehicle_plate
    FROM expenses e
    LEFT JOIN vehicles v ON e.vehicle_id = v.id
    ORDER BY e.expense_date DESC
  `);
  res.json(expenses);
});

router.post('/', authenticate, async (req, res) => {
  const { category, amount, expense_date, description, vehicle_id } = req.body;
  if (!category || !amount) {
    return res.status(400).json({ error: 'ምድብ እና ገንዘብ ያስፈልጋል' });
  }
  
  const db = getDb();
  const result = await db.run(
    'INSERT INTO expenses (category, amount, expense_date, description, vehicle_id, created_by) VALUES (?, ?, ?, ?, ?, ?)',
    [category, amount, expense_date || new Date().toISOString().split('T')[0], description || '', vehicle_id || null, req.user.id]
  );
  
  const newExpense = await db.get('SELECT * FROM expenses WHERE id = ?', result.lastID);
  res.status(201).json(newExpense);
});

router.put('/:id', authenticate, async (req, res) => {
  const { category, amount, expense_date, description, vehicle_id } = req.body;
  const db = getDb();
  
  await db.run(
    'UPDATE expenses SET category = ?, amount = ?, expense_date = ?, description = ?, vehicle_id = ? WHERE id = ?',
    [category, amount, expense_date, description, vehicle_id, req.params.id]
  );
  
  const updated = await db.get('SELECT * FROM expenses WHERE id = ?', req.params.id);
  res.json(updated);
});

router.delete('/:id', authenticate, async (req, res) => {
  const db = getDb();
  await db.run('DELETE FROM expenses WHERE id = ?', req.params.id);
  res.json({ success: true });
});

module.exports = router;
