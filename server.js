const express = require('express');
const session = require('express-session');
const dotenv = require('dotenv');
const path = require('path');
const fs = require('fs');

dotenv.config();

const app = express();
const PORT = process.env.PORT || 5000;

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
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

// Database
const { initDatabase } = require('./db/pool');
initDatabase().catch(err => {
  console.error('የውሂብ ጎታ ስህተት:', err);
  process.exit(1);
});

// Routes
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
app.use(require('./middleware/errorHandler'));

// Serve frontend
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`ሰርቨር በፖርት ${PORT} ላይ ተጀምሯል`);
  console.log(`አድራሻ: http://localhost:${PORT}`);
});
