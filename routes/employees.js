const express = require('express');
const { getDb } = require('../db/pool');
const { authenticate, authorize } = require('../middleware/auth');

const router = express.Router();

router.get('/', authenticate, async (req, res) => {
  const db = getDb();
  const employees = await db.all('SELECT * FROM employees ORDER BY name');
  res.json(employees);
});

router.get('/:id', authenticate, async (req, res) => {
  const db = getDb();
  const employee = await db.get('SELECT * FROM employees WHERE id = ?', req.params.id);
  if (!employee) return res.status(404).json({ error: 'ሰራተኛ አልተገኘም' });
  res.json(employee);
});

router.post('/', authenticate, authorize('admin'), async (req, res) => {
  const { name, phone, position, salary, hire_date } = req.body;
  if (!name) return res.status(400).json({ error: 'ስም ያስፈልጋል' });
  
  const db = getDb();
  const result = await db.run(
    'INSERT INTO employees (name, phone, position, salary, hire_date) VALUES (?, ?, ?, ?, ?)',
    [name, phone || '', position || '', salary || 0, hire_date || null]
  );
  
  const newEmployee = await db.get('SELECT * FROM employees WHERE id = ?', result.lastID);
  res.status(201).json(newEmployee);
});

router.put('/:id', authenticate, authorize('admin'), async (req, res) => {
  const { name, phone, position, salary, hire_date, is_active } = req.body;
  const db = getDb();
  
  await db.run(
    'UPDATE employees SET name = ?, phone = ?, position = ?, salary = ?, hire_date = ?, is_active = ? WHERE id = ?',
    [name, phone, position, salary, hire_date, is_active, req.params.id]
  );
  
  const updated = await db.get('SELECT * FROM employees WHERE id = ?', req.params.id);
  res.json(updated);
});

router.delete('/:id', authenticate, authorize('admin'), async (req, res) => {
  const db = getDb();
  await db.run('DELETE FROM employees WHERE id = ?', req.params.id);
  res.json({ success: true });
});

module.exports = router;
