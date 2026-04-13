const express = require('express');
const { getDb } = require('../db/pool');
const { authenticate, authorize } = require('../middleware/auth');
const bcrypt = require('bcryptjs');

const router = express.Router();

function getEmployeeTypeCode(type) {
  const codes = { 'sales': 'SAL', 'admin': 'ADM', 'manager': 'MGR', 'warehouse': 'WRH' };
  return codes[type] || 'EMP';
}

async function generateUsername(fullName, employeeType, db) {
  let baseName = fullName.toLowerCase().replace(/\s/g, '').substring(0, 5);
  const typeCode = getEmployeeTypeCode(employeeType);
  let username = `${typeCode}${baseName}`;
  const existing = await db.get('SELECT id FROM users WHERE username = ?', username);
  if (existing) {
    username = `${username}${Math.floor(Math.random() * 100)}`;
  }
  return username;
}

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

// Create employee
router.post('/', authenticate, authorize('admin'), async (req, res) => {
  const { name, phone, position, employee_type, salary, hire_date, create_user_account } = req.body;
  if (!name) return res.status(400).json({ error: 'ስም ያስፈልጋል' });
  
  const db = getDb();
  const result = await db.run(
    `INSERT INTO employees (name, phone, position, employee_type, salary, hire_date) 
     VALUES (?, ?, ?, ?, ?, ?)`,
    [name, phone || '', position || '', employee_type || 'sales', salary || 0, hire_date || null]
  );
  
  const employeeId = result.lastID;
  let userAccount = null;
  
  if (create_user_account !== false) {
    const username = await generateUsername(name, employee_type || 'sales', db);
    const tempPassword = 'Temp@' + Math.floor(10000 + Math.random() * 90000);
    const hashedPassword = await bcrypt.hash(tempPassword, 10);
    
    await db.run(
      `INSERT INTO users (username, password, full_name, role, employee_type, employee_id) 
       VALUES (?, ?, ?, ?, ?, ?)`,
      [username, hashedPassword, name, 'staff', employee_type || 'sales', employeeId]
    );
    
    const user = await db.get('SELECT id FROM users WHERE employee_id = ?', employeeId);
    await db.run('UPDATE employees SET user_id = ? WHERE id = ?', [user.id, employeeId]);
    userAccount = { username, tempPassword };
  }
  
  const newEmployee = await db.get('SELECT * FROM employees WHERE id = ?', employeeId);
  res.status(201).json({ employee: newEmployee, userAccount });
});

// Update employee
router.put('/:id', authenticate, authorize('admin'), async (req, res) => {
  const { name, phone, position, employee_type, salary, hire_date, is_active } = req.body;
  const db = getDb();
  
  await db.run(
    `UPDATE employees SET name = ?, phone = ?, position = ?, employee_type = ?, salary = ?, hire_date = ?, is_active = ? WHERE id = ?`,
    [name, phone, position, employee_type, salary, hire_date, is_active, req.params.id]
  );
  
  const user = await db.get('SELECT id FROM users WHERE employee_id = ?', req.params.id);
  if (user) {
    await db.run('UPDATE users SET full_name = ?, is_active = ?, employee_type = ? WHERE employee_id = ?', 
      [name, is_active, employee_type, req.params.id]);
    if (is_active === 0) {
      await db.run('UPDATE users SET is_active = 0 WHERE employee_id = ?', req.params.id);
    } else if (is_active === 1) {
      await db.run('UPDATE users SET is_active = 1 WHERE employee_id = ?', req.params.id);
    }
  }
  
  const updated = await db.get('SELECT * FROM employees WHERE id = ?', req.params.id);
  res.json(updated);
});

// Delete employee
router.delete('/:id', authenticate, authorize('admin'), async (req, res) => {
  const db = getDb();
  await db.run('DELETE FROM users WHERE employee_id = ?', req.params.id);
  await db.run('DELETE FROM employees WHERE id = ?', req.params.id);
  res.json({ success: true });
});

// Reset password
router.post('/:id/reset-password', authenticate, authorize('admin'), async (req, res) => {
  const db = getDb();
  const employee = await db.get('SELECT * FROM employees WHERE id = ?', req.params.id);
  if (!employee) return res.status(404).json({ error: 'ሰራተኛ አልተገኘም' });
  
  const tempPassword = 'Temp@' + Math.floor(10000 + Math.random() * 90000);
  const hashedPassword = await bcrypt.hash(tempPassword, 10);
  
  await db.run('UPDATE users SET password = ? WHERE employee_id = ?', [hashedPassword, req.params.id]);
  res.json({ success: true, tempPassword });
});

// Get employee types
router.get('/types/list', authenticate, async (req, res) => {
  const types = [
    { value: 'sales', label: 'የሽያጭ ሰራተኛ', code: 'SAL' },
    { value: 'admin', label: 'አስተዳዳሪ', code: 'ADM' },
    { value: 'manager', label: 'ማኔጅር', code: 'MGR' },
    { value: 'warehouse', label: 'የመጋዘን ሰራተኛ', code: 'WRH' }
  ];
  res.json(types);
});

module.exports = router;
