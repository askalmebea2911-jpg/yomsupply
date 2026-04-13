const express = require('express');
const bcrypt = require('bcryptjs');
const { getDb } = require('../db/pool');
const { authenticate, authorize } = require('../middleware/auth');

const router = express.Router();

// Get all users
router.get('/', authenticate, authorize('admin'), async (req, res) => {
  const db = getDb();
  const users = await db.all(`
    SELECT u.id, u.username, u.full_name, u.role, u.employee_type, u.is_active, u.created_at,
           e.id as employee_id, e.name as employee_name, e.position
    FROM users u
    LEFT JOIN employees e ON u.employee_id = e.id
    ORDER BY u.created_at DESC
  `);
  res.json(users);
});

// Create user
router.post('/', authenticate, authorize('admin'), async (req, res) => {
  const { username, password, full_name, role, employee_type, employee_id } = req.body;
  
  if (!username || !password || !full_name) {
    return res.status(400).json({ error: 'ሁሉም መረጃዎች ያስፈልጋሉ' });
  }
  
  const db = getDb();
  const existing = await db.get('SELECT id FROM users WHERE username = ?', username);
  if (existing) {
    return res.status(400).json({ error: 'ይህ ስም ቀድሞ አለ' });
  }
  
  const hashedPassword = await bcrypt.hash(password, 10);
  const result = await db.run(
    `INSERT INTO users (username, password, full_name, role, employee_type, employee_id) 
     VALUES (?, ?, ?, ?, ?, ?)`,
    [username, hashedPassword, full_name, role || 'staff', employee_type || 'sales', employee_id || null]
  );
  
  // If employee_id is provided, update employee table with user_id
  if (employee_id) {
    await db.run('UPDATE employees SET user_id = ? WHERE id = ?', [result.lastID, employee_id]);
  }
  
  const newUser = await db.get('SELECT id, username, full_name, role, employee_type FROM users WHERE id = ?', result.lastID);
  res.status(201).json(newUser);
});

// Update user
router.put('/:id', authenticate, authorize('admin'), async (req, res) => {
  const { full_name, role, employee_type, is_active, password } = req.body;
  const db = getDb();
  
  if (password) {
    const hashedPassword = await bcrypt.hash(password, 10);
    await db.run(
      `UPDATE users SET full_name = ?, role = ?, employee_type = ?, is_active = ?, password = ? WHERE id = ?`,
      [full_name, role, employee_type, is_active, hashedPassword, req.params.id]
    );
  } else {
    await db.run(
      `UPDATE users SET full_name = ?, role = ?, employee_type = ?, is_active = ? WHERE id = ?`,
      [full_name, role, employee_type, is_active, req.params.id]
    );
  }
  
  res.json({ success: true });
});

// Delete user
router.delete('/:id', authenticate, authorize('admin'), async (req, res) => {
  if (req.params.id == req.user.id) {
    return res.status(400).json({ error: 'ራስዎን መሰረዝ አይችሉም' });
  }
  
  const db = getDb();
  await db.run('UPDATE employees SET user_id = NULL WHERE user_id = ?', req.params.id);
  await db.run('DELETE FROM users WHERE id = ?', req.params.id);
  res.json({ success: true });
});

// Get employees without users (for linking)
router.get('/available-employees', authenticate, authorize('admin'), async (req, res) => {
  const db = getDb();
  const employees = await db.all(`
    SELECT id, name, position, employee_type FROM employees 
    WHERE user_id IS NULL AND is_active = 1
  `);
  res.json(employees);
});

module.exports = router;
