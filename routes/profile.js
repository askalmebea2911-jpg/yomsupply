const express = require('express');
const bcrypt = require('bcryptjs');
const { getDb } = require('../db/pool');
const { authenticate, authorize } = require('../middleware/auth');

const router = express.Router();

// Get current user profile
router.get('/me', authenticate, async (req, res) => {
  const db = getDb();
  const user = await db.get('SELECT id, username, full_name, role, employee_type FROM users WHERE id = ?', req.user.id);
  res.json(user);
});

// Change password
router.post('/change-password', authenticate, async (req, res) => {
  const { current_password, new_password } = req.body;
  
  if (!current_password || !new_password) {
    return res.status(400).json({ error: 'አሁን ያለው እና አዲስ ይለፍ ቃል ያስፈልጋል' });
  }
  
  if (new_password.length < 4) {
    return res.status(400).json({ error: 'አዲስ ይለፍ ቃል ቢያንስ 4 ፊደላት ሊኖረው ይገባል' });
  }
  
  const db = getDb();
  const user = await db.get('SELECT * FROM users WHERE id = ?', req.user.id);
  
  if (!user) {
    return res.status(404).json({ error: 'ተጠቃሚ አልተገኘም' });
  }
  
  const isValid = await bcrypt.compare(current_password, user.password);
  if (!isValid) {
    return res.status(401).json({ error: 'አሁን ያለው ይለፍ ቃል ተሳስቷል' });
  }
  
  const hashedPassword = await bcrypt.hash(new_password, 10);
  await db.run('UPDATE users SET password = ? WHERE id = ?', [hashedPassword, req.user.id]);
  
  res.json({ success: true, message: 'ይለፍ ቃል ተቀይሯል' });
});

// Admin force reset any user password
router.post('/admin-reset/:id', authenticate, authorize('admin'), async (req, res) => {
  const { new_password } = req.body;
  const userId = req.params.id;
  
  if (!new_password || new_password.length < 4) {
    return res.status(400).json({ error: 'አዲስ ይለፍ ቃል ቢያንስ 4 ፊደላት ሊኖረው ይገባል' });
  }
  
  const db = getDb();
  const hashedPassword = await bcrypt.hash(new_password, 10);
  await db.run('UPDATE users SET password = ? WHERE id = ?', [hashedPassword, userId]);
  
  res.json({ success: true, message: 'ይለፍ ቃል ተስተካክሏል' });
});

// Deactivate user
router.put('/deactivate/:id', authenticate, authorize('admin'), async (req, res) => {
  const userId = req.params.id;
  if (userId == req.user.id) {
    return res.status(400).json({ error: 'ራስዎን ማሰናከል አይችሉም' });
  }
  
  const db = getDb();
  await db.run('UPDATE users SET is_active = 0 WHERE id = ?', userId);
  
  const user = await db.get('SELECT employee_id FROM users WHERE id = ?', userId);
  if (user && user.employee_id) {
    await db.run('UPDATE employees SET is_active = 0 WHERE id = ?', user.employee_id);
  }
  
  res.json({ success: true, message: 'ተጠቃሚ ተሰናክሏል' });
});

// Activate user
router.put('/activate/:id', authenticate, authorize('admin'), async (req, res) => {
  const db = getDb();
  await db.run('UPDATE users SET is_active = 1 WHERE id = ?', req.params.id);
  
  const user = await db.get('SELECT employee_id FROM users WHERE id = ?', req.params.id);
  if (user && user.employee_id) {
    await db.run('UPDATE employees SET is_active = 1 WHERE id = ?', user.employee_id);
  }
  
  res.json({ success: true, message: 'ተጠቃሚ ንቁ ተደርጓል' });
});

module.exports = router;
