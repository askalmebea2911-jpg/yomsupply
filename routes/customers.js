const express = require('express');
const { getDb } = require('../db/pool');
const { authenticate, authorize } = require('../middleware/auth');

const router = express.Router();

// Get all customers
router.get('/', authenticate, async (req, res) => {
  const db = getDb();
  const customers = await db.all('SELECT * FROM customers ORDER BY name');
  res.json(customers);
});

// Get single customer
router.get('/:id', authenticate, async (req, res) => {
  const db = getDb();
  const customer = await db.get('SELECT * FROM customers WHERE id = ?', req.params.id);
  if (!customer) return res.status(404).json({ error: 'ደንበኛ አልተገኘም' });
  res.json(customer);
});

// Create customer
router.post('/', authenticate, async (req, res) => {
  const { name, phone, address, email, tin_number, credit_limit, notes } = req.body;
  
  if (!name) return res.status(400).json({ error: 'ስም ያስፈልጋል' });
  
  const db = getDb();
  const result = await db.run(
    'INSERT INTO customers (name, phone, address, email, tin_number, credit_limit, notes) VALUES (?, ?, ?, ?, ?, ?, ?)',
    [name, phone || '', address || '', email || '', tin_number || '', credit_limit || 0, notes || '']
  );
  
  const newCustomer = await db.get('SELECT * FROM customers WHERE id = ?', result.lastID);
  res.status(201).json(newCustomer);
});

// Update customer
router.put('/:id', authenticate, async (req, res) => {
  const { name, phone, address, email, tin_number, credit_limit, notes } = req.body;
  const db = getDb();
  
  await db.run(
    'UPDATE customers SET name = ?, phone = ?, address = ?, email = ?, tin_number = ?, credit_limit = ?, notes = ? WHERE id = ?',
    [name, phone, address, email, tin_number, credit_limit, notes, req.params.id]
  );
  
  const updated = await db.get('SELECT * FROM customers WHERE id = ?', req.params.id);
  res.json(updated);
});

// Delete customer
router.delete('/:id', authenticate, authorize('admin'), async (req, res) => {
  const db = getDb();
  await db.run('DELETE FROM customers WHERE id = ?', req.params.id);
  res.json({ success: true });
});

module.exports = router;
