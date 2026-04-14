const express = require('express');
const { getDb } = require('../db/pool');
const { authenticate, authorize } = require('../middleware/auth');
const bcrypt = require('bcryptjs');

const router = express.Router();

function getEmployeeTypeCode(type) {
  const codes = { 'sales': 'SAL', 'admin': 'ADM', 'accountant': 'ACC', 'warehouse': 'WRH' };
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
  try {
    const db = getDb();
    const employees = await db.all(`
      SELECT e.*, u.username, u.id as user_id, u.is_active as user_active
      FROM employees e
      LEFT JOIN users u ON e.user_id = u.id
      ORDER BY e.name
    `);
    res.json(employees);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get single employee
router.get('/:id', authenticate, async (req, res) => {
  try {
    const db = getDb();
    const employee = await db.get('SELECT * FROM employees WHERE id = ?', req.params.id);
    if (!employee) return res.status(404).json({ error: 'ሰራተኛ አልተገኘም' });
    res.json(employee);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Create employee
router.post('/', authenticate, authorize('admin'), async (req, res) => {
  try {
    const { name, phone, position, employee_type, salary, hire_date, create_user_account } = req.body;
    
    if (!name) {
      return res.status(400).json({ error: 'ስም ያስፈልጋል' });
    }
    
    const db = getDb();
    
    const result = await db.run(
      `INSERT INTO employees (name, phone, position, employee_type, salary, hire_date, is_active) 
       VALUES (?, ?, ?, ?, ?, ?, 1)`,
      [name, phone || '', position || '', employee_type || 'sales', salary || 0, hire_date || null]
    );
    
    const employeeId = result.lastID;
    let userAccount = null;
    
    if (create_user_account !== false && create_user_account !== 'false') {
      const username = await generateUsername(name, employee_type || 'sales', db);
      const tempPassword = 'Temp@' + Math.floor(1000 + Math.random() * 9000);
      const hashedPassword = await bcrypt.hash(tempPassword, 10);
      
      let role = 'staff';
      if (employee_type === 'admin') role = 'admin';
      else if (employee_type === 'accountant') role = 'accountant';
      else if (employee_type === 'warehouse') role = 'warehouse';
      else if (employee_type === 'sales') role = 'sales';
      
      await db.run(
        `INSERT INTO users (username, password, full_name, role, employee_type, employee_id, is_active) 
         VALUES (?, ?, ?, ?, ?, ?, 1)`,
        [username, hashedPassword, name, role, employee_type || 'sales', employeeId]
      );
      
      const user = await db.get('SELECT id FROM users WHERE employee_id = ?', employeeId);
      if (user) {
        await db.run('UPDATE employees SET user_id = ? WHERE id = ?', [user.id, employeeId]);
      }
      
      userAccount = { username, tempPassword };
    }
    
    const newEmployee = await db.get('SELECT * FROM employees WHERE id = ?', employeeId);
    res.status(201).json({ success: true, employee: newEmployee, userAccount });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Update employee
router.put('/:id', authenticate, authorize('admin'), async (req, res) => {
  try {
    const { name, phone, position, employee_type, salary, hire_date, is_active } = req.body;
    const db = getDb();
    
    await db.run(
      `UPDATE employees SET name = ?, phone = ?, position = ?, employee_type = ?, salary = ?, hire_date = ?, is_active = ? WHERE id = ?`,
      [name, phone, position, employee_type, salary, hire_date, is_active, req.params.id]
    );
    
    const user = await db.get('SELECT id FROM users WHERE employee_id = ?', req.params.id);
    if (user) {
      let role = 'staff';
      if (employee_type === 'admin') role = 'admin';
      else if (employee_type === 'accountant') role = 'accountant';
      else if (employee_type === 'warehouse') role = 'warehouse';
      else if (employee_type === 'sales') role = 'sales';
      
      await db.run('UPDATE users SET full_name = ?, is_active = ?, employee_type = ?, role = ? WHERE employee_id = ?', 
        [name, is_active, employee_type, role, req.params.id]);
    }
    
    const updated = await db.get('SELECT * FROM employees WHERE id = ?', req.params.id);
    res.json(updated);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Delete employee
router.delete('/:id', authenticate, authorize('admin'), async (req, res) => {
  try {
    const db = getDb();
    await db.run('DELETE FROM users WHERE employee_id = ?', req.params.id);
    await db.run('DELETE FROM employees WHERE id = ?', req.params.id);
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Reset password
router.post('/:id/reset-password', authenticate, authorize('admin'), async (req, res) => {
  try {
    const db = getDb();
    const employee = await db.get('SELECT * FROM employees WHERE id = ?', req.params.id);
    if (!employee) return res.status(404).json({ error: 'ሰራተኛ አልተገኘም' });
    
    const tempPassword = 'Temp@' + Math.floor(1000 + Math.random() * 9000);
    const hashedPassword = await bcrypt.hash(tempPassword, 10);
    
    await db.run('UPDATE users SET password = ? WHERE employee_id = ?', [hashedPassword, req.params.id]);
    res.json({ success: true, tempPassword });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get employee types
router.get('/types/list', authenticate, async (req, res) => {
  const types = [
    { value: 'sales', label: 'የሽያጭ ሰራተኛ', code: 'SAL' },
    { value: 'admin', label: 'አስተዳዳሪ', code: 'ADM' },
    { value: 'accountant', label: 'ሂሳብ ሰራተኛ', code: 'ACC' },
    { value: 'warehouse', label: 'የመጋዘን ሰራተኛ', code: 'WRH' }
  ];
  res.json(types);
});

module.exports = router;
