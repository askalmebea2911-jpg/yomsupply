const express = require('express');
const session = require('express-session');
const dotenv = require('dotenv');
const path = require('path');
const fs = require('fs');

dotenv.config();

const app = express();
const PORT = process.env.PORT || 10000;

// ጊዜ ገደብ ጨምር (60 ሰከንድ)
app.use((req, res, next) => {
  res.setTimeout(60000, () => {
    res.status(408).json({ error: 'ጥያቄው ጊዜ አልፏል' });
  });
  next();
});

// Middleware
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
app.use(express.static('public'));

// Session
app.use(session({
  secret: process.env.SESSION_SECRET || 'yom_sales_secret_key_2024',
  resave: false,
  saveUninitialized: false,
  cookie: { 
    secure: false,
    maxAge: 24 * 60 * 60 * 1000 
  }
}));

// Uploads folder
const uploadsDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir);

// Database - SQLite (ቀላል እና ፈጣን)
const { initDatabase, getDb } = require('./db/pool');

// ውሂብ ጎታ ማስጀመሪያ ስህተት ከተከሰተ እንኳን ሰርቨሩ አይወድቅም
initDatabase().catch(err => {
  console.error('የውሂብ ጎታ ስህተት:', err.message);
});

// Routes - ሁሉም በትክክል ተዘርዝረዋል
app.use('/api/auth', require('./routes/auth'));
app.use('/api/customers', require('./routes/customers'));
app.use('/api/products', require('./routes/products'));
app.use('/api/sales', require('./routes/sales'));
app.use('/api/employees', require('./routes/employees'));
app.use('/api/vehicles', require('./routes/vehicles'));
app.use('/api/expenses', require('./routes/expenses'));
app.use('/api/preorders', require('./routes/preorders'));
app.use('/api/warehouse', require('./routes/warehouse'));
app.use('/api/dashboard', require('./routes/dashboard'));
app.use('/api/reports', require('./routes/reports'));
app.use('/api/users', require('./routes/users'));
app.use('/api/tracking', require('./routes/tracking'));
app.use('/api/telegram', require('./routes/telegram'));
app.use('/api/profile', require('./routes/profile'));

// Error handler
app.use((err, req, res, next) => {
  console.error('ስህተት:', err.message);
  res.status(500).json({ error: err.message || 'የሰርቨር ስህተት' });
});

// 404 handler - ያልተገኘ መንገድ
app.use((req, res) => {
  res.status(404).json({ error: 'መንገዱ አልተገኘም' });
});

// Serve frontend - ለማንኛውም ሌላ ጥያቄ index.html ላክ
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Start server
const server = app.listen(PORT, '0.0.0.0', () => {
  console.log(`ሰርቨር በፖርት ${PORT} ላይ ተጀምሯል`);
});

// ያልተጠበቀ ስህተት ከተከሰተ ሰርቨሩ እንዳይወድቅ
process.on('uncaughtException', (err) => {
  console.error('ያልተጠበቀ ስህተት:', err.message);
});

process.on('unhandledRejection', (err) => {
  console.error('ያልተያዘ ተስፋ መቁረጥ:', err);
});
