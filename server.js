const express = require('express');
const session = require('express-session');
const dotenv = require('dotenv');
const path = require('path');
const fs = require('fs');

dotenv.config();

const app = express();
const PORT = process.env.PORT || 10000;

// Timeout middleware
app.use((req, res, next) => {
  res.setTimeout(60000, () => {
    res.status(408).json({ error: 'ጥያቄው ጊዜ አልፏል' });
  });
  next();
});

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
app.use(express.static('public'));

// Session
app.use(session({
  secret: process.env.SESSION_SECRET || 'yom_sales_secret_key_2024',
  resave: false,
  saveUninitialized: false,
  cookie: { secure: false, maxAge: 24 * 60 * 60 * 1000 }
}));

// Uploads folder
const uploadsDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir);

// Database
const { initDatabase } = require('./db/pool');
initDatabase().catch(err => console.error('DB Error:', err.message));

// Routes - ሁሉም ተካተዋል
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
  console.error('Error:', err.message);
  res.status(500).json({ error: err.message || 'የሰርቨር ስህተት' });
});

// Serve frontend
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`ሰርቨር በፖርት ${PORT} ላይ ተጀምሯል`);
});

process.on('uncaughtException', (err) => console.error('Uncaught:', err.message));
process.on('unhandledRejection', (err) => console.error('Unhandled:', err));
