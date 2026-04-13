const express = require('express');
const { getDb } = require('../db/pool');
const { authenticate, authorize } = require('../middleware/auth');
const bcrypt = require('bcryptjs');

const router = express.Router();

// Get all employees
router.get('/', authenticate, async (req, res) => {
  const db = getDb();
  const employees = await db.all(`
    SELECT e.*, u.username, u.id as user_id, u.is_active as user_active
    FROM employees e
    LEFT JOIN users u ON e.user_id = u.id
    ORDER BY e.name
  `);
  res.json(employees);
});

// Get single employee
router.get('/:id', authenticate, async (req, res) => {
  const db = getDb();
  const employee = await db.get('SELECT * FROM employees WHERE id = ?', req.params.id);
  if (!employee) return res.status(404).json({ error: 'ሰራተኛ አልተገኘም' });
  res.json(employee);
});

// Create employee with automatic user account
router.post('/', authenticate, authorize('admin'), async (req, res) => {
  const { name, phone, position, salary, hire_date, create_user_account } = req.body;
  if (!name) return res.status(400).json({ error: 'ስም ያስፈልጋል' });
  
  const db = getDb();
  
  // Insert employee
  const result = await db.run(
    'INSERT INTO employees (name, phone, position, salary, hire_date) VALUES (?, ?, ?, ?, ?)',
    [name, phone || '', position || '', salary || 0, hire_date || null]
  );
  
  const employeeId = result.lastID;
  
  // Create user account if requested
  let userAccount = null;
  if (create_user_account) {
    const username = name.toLowerCase().replace(/\s/g, '') + employeeId;
    const tempPassword = 'Temp@' + Math.random().toString(36).substr(2, 6);
    const hashedPassword = await bcrypt.hash(tempPassword, 10);
    
    await db.run(
      'INSERT INTO users (username, password, full_name, role, employee_id) VALUES (?, ?, ?, ?, ?)',
      [username, hashedPassword, name, 'staff', employeeId]
    );
    
    await db.run('UPDATE employees SET user_id = (SELECT id FROM users WHERE employee_id = ?)', employeeId);
    
    userAccount = { username, tempPassword };
  }
  
  const newEmployee = await db.get('SELECT * FROM employees WHERE id = ?', employeeId);
  res.status(201).json({ employee: newEmployee, userAccount });
});

// Update employee
router.put('/:id', authenticate, authorize('admin'), async (req, res) => {
  const { name, phone, position, salary, hire_date, is_active } = req.body;
  const db = getDb();
  
  await db.run(
    'UPDATE employees SET name = ?, phone = ?, position = ?, salary = ?, hire_date = ?, is_active = ? WHERE id = ?',
    [name, phone, position, salary, hire_date, is_active, req.params.id]
  );
  
  // If employee is deactivated, also deactivate user account
  if (is_active === 0) {
    await db.run('UPDATE users SET is_active = 0 WHERE employee_id = ?', req.params.id);
  } else if (is_active === 1) {
    await db.run('UPDATE users SET is_active = 1 WHERE employee_id = ?', req.params.id);
  }
  
  const updated = await db.get('SELECT * FROM employees WHERE id = ?', req.params.id);
  res.json(updated);
});

// Delete employee
router.delete('/:id', authenticate, authorize('admin'), async (req, res) => {
  const db = getDb();
  // First delete associated user account
  await db.run('DELETE FROM users WHERE employee_id = ?', req.params.id);
  await db.run('DELETE FROM employees WHERE id = ?', req.params.id);
  res.json({ success: true });
});

// Reset employee password (admin only)
router.post('/:id/reset-password', authenticate, authorize('admin'), async (req, res) => {
  const db = getDb();
  const employee = await db.get('SELECT * FROM employees WHERE id = ?', req.params.id);
  if (!employee) return res.status(404).json({ error: 'ሰራተኛ አልተገኘም' });
  
  const tempPassword = 'Temp@' + Math.random().toString(36).substr(2, 6);
  const hashedPassword = await bcrypt.hash(tempPassword, 10);
  
  await db.run('UPDATE users SET password = ? WHERE employee_id = ?', [hashedPassword, req.params.id]);
  
  res.json({ success: true, tempPassword });
});

module.exports = router;
