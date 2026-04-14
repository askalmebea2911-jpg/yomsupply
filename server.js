const express = require('express');
const session = require('express-session');
const path = require('path');
const sqlite3 = require('sqlite3');
const { open } = require('sqlite');
const bcrypt = require('bcryptjs');

const app = express();
const PORT = process.env.PORT || 10000;

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static('public'));

app.use(session({
  secret: 'yom_secret_2024',
  resave: false,
  saveUninitialized: false,
  cookie: { maxAge: 24 * 60 * 60 * 1000 }
}));

// Database
let db;

async function initDB() {
  db = await open({
    filename: './yom_sales.db',
    driver: sqlite3.Database
  });
  
  await db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT UNIQUE NOT NULL,
      password TEXT NOT NULL,
      full_name TEXT NOT NULL,
      role TEXT DEFAULT 'admin',
      is_active INTEGER DEFAULT 1
    )
  `);
  
  const admin = await db.get("SELECT * FROM users WHERE username = 'admin'");
  if (!admin) {
    const hashed = await bcrypt.hash('admin123', 10);
    await db.run("INSERT INTO users (username, password, full_name, role) VALUES (?, ?, ?, ?)", 
      ['admin', hashed, 'አስተዳዳሪ', 'admin']);
    console.log('Admin created: admin / admin123');
  }
  
  console.log('Database ready');
}

initDB();

// Auth routes
app.post('/api/login', async (req, res) => {
  const { username, password } = req.body;
  const user = await db.get("SELECT * FROM users WHERE username = ? AND is_active = 1", username);
  if (!user) return res.status(401).json({ error: 'Invalid credentials' });
  
  const valid = await bcrypt.compare(password, user.password);
  if (!valid) return res.status(401).json({ error: 'Invalid credentials' });
  
  req.session.userId = user.id;
  res.json({ success: true, user: { id: user.id, username: user.username, full_name: user.full_name, role: user.role } });
});

app.get('/api/me', async (req, res) => {
  if (!req.session.userId) return res.status(401).json({ error: 'Not logged in' });
  const user = await db.get("SELECT id, username, full_name, role FROM users WHERE id = ?", req.session.userId);
  res.json(user);
});

app.post('/api/logout', (req, res) => {
  req.session.destroy();
  res.json({ success: true });
});

app.get('/api/test', (req, res) => {
  res.json({ message: 'API is working!' });
});

app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`Server running on port ${PORT}`);
});
