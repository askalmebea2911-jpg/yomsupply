const express = require('express');
const bcrypt = require('bcryptjs');
const { getDb } = require('../db/pool');
const { authenticate } = require('../middleware/auth');

const router = express.Router();

router.post('/login', async (req, res) => {
  const { username, password } = req.body;
  
  if (!username || !password) {
    return res.status(400).json({ error: 'ስም እና ይለፍ ቃል ያስፈልጋል' });
  }
  
  const db = getDb();
  const user = await db.get('SELECT * FROM users WHERE username = ? AND is_active = 1', username);
  
  if (!user) {
    return res.status(401).json({ error: 'የተጠቃሚ ስም ወይም ይለፍ ቃል ተሳስቷል' });
  }
  
  const isValid = await bcrypt.compare(password, user.password);
  if (!isValid) {
    return res.status(401).json({ error: 'የተጠቃሚ ስም ወይም ይለፍ ቃል ተሳስቷል' });
  }
  
  req.session.userId = user.id;
  delete user.password;
  res.json({ success: true, user });
});

router.post('/logout', (req, res) => {
  req.session.destroy();
  res.json({ success: true });
});

router.get('/me', authenticate, async (req, res) => {
  const db = getDb();
  const user = await db.get('SELECT id, username, full_name, role FROM users WHERE id = ?', req.user.id);
  res.json(user);
});

module.exports = router;
