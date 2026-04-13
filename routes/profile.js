const express = require('express');
const bcrypt = require('bcryptjs');
const { getDb } = require('../db/pool');
const { authenticate } = require('../middleware/auth');

const router = express.Router();

// Get current user profile
router.get('/me', authenticate, async (req, res) => {
  const db = getDb();
  const user = await db.get('SELECT id, username, full_name, role FROM users WHERE id = ?', req.user.id);
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
  
  const isValid = await bcrypt.compare(current_password, user.password);
  if (!isValid) {
    return res.status(401).json({ error: 'አሁን ያለው ይለፍ ቃል ተሳስቷል' });
  }
  
  const hashedPassword = await bcrypt.hash(new_password, 10);
  await db.run('UPDATE users SET password = ? WHERE id = ?', [hashedPassword, req.user.id]);
  
  res.json({ success: true, message: 'ይለፍ ቃል ተቀይሯል' });
});

module.exports = router;
