const express = require('express');
const session = require('express-session');
const path = require('path');
const fs = require('fs');
const sqlite3 = require('sqlite3');
const { open } = require('sqlite');
const bcrypt = require('bcryptjs');
const multer = require('multer');

const app = express();
const PORT = process.env.PORT || 10000;

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static('public'));

// Session
app.use(session({
  secret: 'yom_final_secret_2024',
  resave: false,
  saveUninitialized: false,
  cookie: { maxAge: 24 * 60 * 60 * 1000 }
}));

// Upload
const upload = multer({ dest: 'uploads/' });
if (!fs.existsSync('uploads')) fs.mkdirSync('uploads');

// Database
let db;

async function initDB() {
  db = await open({
    filename: './yom_sales.db',
    driver: sqlite3.Database
  });
  
  // Create all tables
  await db.exec(`
    -- Users table
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT UNIQUE NOT NULL,
      password TEXT NOT NULL,
      full_name TEXT NOT NULL,
      role TEXT DEFAULT 'staff',
      employee_type TEXT DEFAULT 'sales',
      is_active INTEGER DEFAULT 1,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
    
    -- Employees table
    CREATE TABLE IF NOT EXISTS employees (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      phone TEXT,
      position TEXT,
      employee_type TEXT DEFAULT 'sales',
      salary REAL,
      hire_date DATE,
      is_active INTEGER DEFAULT 1,
      user_id INTEGER
    );
    
    -- Customers table
    CREATE TABLE IF NOT EXISTS customers (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      phone TEXT,
      address TEXT,
      email TEXT,
      credit_limit REAL DEFAULT 0,
      current_credit REAL DEFAULT 0,
      notes TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
    
    -- Products table
    CREATE TABLE IF NOT EXISTS products (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      code TEXT UNIQUE,
      category TEXT,
      selling_price REAL NOT NULL,
      cost_price REAL,
      current_stock REAL DEFAULT 0,
      min_stock REAL DEFAULT 0,
      is_active INTEGER DEFAULT 1
    );
    
    -- Sales table
    CREATE TABLE IF NOT EXISTS sales (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      invoice_number TEXT UNIQUE NOT NULL,
      customer_id INTEGER,
      sale_date DATETIME DEFAULT CURRENT_TIMESTAMP,
      subtotal REAL DEFAULT 0,
      discount REAL DEFAULT 0,
      total REAL DEFAULT 0,
      amount_paid REAL DEFAULT 0,
      remaining REAL DEFAULT 0,
      payment_status TEXT DEFAULT 'unpaid',
      created_by INTEGER
    );
    
    -- Sale items table
    CREATE TABLE IF NOT EXISTS sale_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      sale_id INTEGER NOT NULL,
      product_id INTEGER NOT NULL,
      quantity REAL NOT NULL,
      unit_price REAL NOT NULL,
      total REAL NOT NULL
    );
    
    -- Vehicles table
    CREATE TABLE IF NOT EXISTS vehicles (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      plate_number TEXT UNIQUE NOT NULL,
      model TEXT,
      driver_name TEXT,
      driver_phone TEXT,
      status TEXT DEFAULT 'active'
    );
    
    -- Expenses table
    CREATE TABLE IF NOT EXISTS expenses (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      category TEXT NOT NULL,
      amount REAL NOT NULL,
      expense_date DATE DEFAULT CURRENT_DATE,
      description TEXT,
      created_by INTEGER
    );
    
    -- Preorders table
    CREATE TABLE IF NOT EXISTS preorders (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      customer_id INTEGER,
      product_id INTEGER,
      quantity REAL NOT NULL,
      order_date DATETIME DEFAULT CURRENT_TIMESTAMP,
      expected_date DATE,
      status TEXT DEFAULT 'pending',
      notes TEXT
    );
    
    -- Warehouse transactions
    CREATE TABLE IF NOT EXISTS warehouse_transactions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      product_id INTEGER NOT NULL,
      transaction_type TEXT NOT NULL,
      quantity REAL NOT NULL,
      notes TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
  `);
  
  // Create admin user
  const admin = await db.get("SELECT * FROM users WHERE username = 'admin'");
  if (!admin) {
    const hashed = await bcrypt.hash('admin123', 10);
    await db.run(
      "INSERT INTO users (username, password, full_name, role, employee_type) VALUES (?, ?, ?, ?, ?)",
      ['admin', hashed, 'አስተዳዳሪ', 'admin', 'admin']
    );
    console.log('Admin created: admin / admin123');
  }
  
  console.log('Database ready');
}

initDB();

// ==================== AUTH ROUTES ====================
app.post('/api/auth/login', async (req, res) => {
  const { username, password } = req.body;
  const user = await db.get("SELECT * FROM users WHERE username = ? AND is_active = 1", username);
  if (!user) return res.status(401).json({ error: 'የተጠቃሚ ስም ወይም ይለፍ ቃል ተሳስቷል' });
  
  const valid = await bcrypt.compare(password, user.password);
  if (!valid) return res.status(401).json({ error: 'የተጠቃሚ ስም ወይም ይለፍ ቃል ተሳስቷል' });
  
  req.session.userId = user.id;
  delete user.password;
  res.json({ success: true, user });
});

app.get('/api/auth/me', async (req, res) => {
  if (!req.session.userId) return res.status(401).json({ error: 'እባክዎ ይግቡ' });
  const user = await db.get("SELECT id, username, full_name, role FROM users WHERE id = ?", req.session.userId);
  res.json(user);
});

app.post('/api/auth/logout', (req, res) => {
  req.session.destroy();
  res.json({ success: true });
});

// ==================== CUSTOMER ROUTES ====================
app.get('/api/customers', async (req, res) => {
  if (!req.session.userId) return res.status(401).json({ error: 'Unauthorized' });
  const customers = await db.all("SELECT * FROM customers ORDER BY name");
  res.json(customers);
});

app.post('/api/customers', async (req, res) => {
  if (!req.session.userId) return res.status(401).json({ error: 'Unauthorized' });
  const { name, phone, address, email, credit_limit } = req.body;
  if (!name) return res.status(400).json({ error: 'ስም ያስፈልጋል' });
  
  const result = await db.run(
    "INSERT INTO customers (name, phone, address, email, credit_limit) VALUES (?, ?, ?, ?, ?)",
    [name, phone || '', address || '', email || '', credit_limit || 0]
  );
  const newCustomer = await db.get("SELECT * FROM customers WHERE id = ?", result.lastID);
  res.json(newCustomer);
});

app.delete('/api/customers/:id', async (req, res) => {
  if (!req.session.userId) return res.status(401).json({ error: 'Unauthorized' });
  await db.run("DELETE FROM customers WHERE id = ?", req.params.id);
  res.json({ success: true });
});

// ==================== PRODUCT ROUTES ====================
app.get('/api/products', async (req, res) => {
  if (!req.session.userId) return res.status(401).json({ error: 'Unauthorized' });
  const products = await db.all("SELECT * FROM products WHERE is_active = 1 ORDER BY name");
  res.json(products);
});

app.post('/api/products', async (req, res) => {
  if (!req.session.userId) return res.status(401).json({ error: 'Unauthorized' });
  const { name, code, category, selling_price, cost_price, min_stock } = req.body;
  if (!name || !selling_price) return res.status(400).json({ error: 'ስም እና ዋጋ ያስፈልጋል' });
  
  const result = await db.run(
    "INSERT INTO products (name, code, category, selling_price, cost_price, min_stock) VALUES (?, ?, ?, ?, ?, ?)",
    [name, code || null, category || null, selling_price, cost_price || 0, min_stock || 0]
  );
  const newProduct = await db.get("SELECT * FROM products WHERE id = ?", result.lastID);
  res.json(newProduct);
});

app.put('/api/products/:id', async (req, res) => {
  if (!req.session.userId) return res.status(401).json({ error: 'Unauthorized' });
  const { selling_price } = req.body;
  await db.run("UPDATE products SET selling_price = ? WHERE id = ?", [selling_price, req.params.id]);
  res.json({ success: true });
});

app.delete('/api/products/:id', async (req, res) => {
  if (!req.session.userId) return res.status(401).json({ error: 'Unauthorized' });
  await db.run("UPDATE products SET is_active = 0 WHERE id = ?", req.params.id);
  res.json({ success: true });
});

// ==================== SALE ROUTES ====================
async function generateInvoiceNumber() {
  const last = await db.get("SELECT invoice_number FROM sales ORDER BY id DESC LIMIT 1");
  if (!last) return 'INV-00001';
  const num = parseInt(last.invoice_number.split('-')[1]) + 1;
  return `INV-${String(num).padStart(5, '0')}`;
}

app.get('/api/sales', async (req, res) => {
  if (!req.session.userId) return res.status(401).json({ error: 'Unauthorized' });
  const sales = await db.all(`
    SELECT s.*, c.name as customer_name 
    FROM sales s 
    LEFT JOIN customers c ON s.customer_id = c.id 
    ORDER BY s.sale_date DESC
  `);
  res.json(sales);
});

app.post('/api/sales', async (req, res) => {
  if (!req.session.userId) return res.status(401).json({ error: 'Unauthorized' });
  const { customer_id, items, discount, amount_paid } = req.body;
  
  if (!items || items.length === 0) {
    return res.status(400).json({ error: 'ቢያንስ አንድ ምርት ያስፈልጋል' });
  }
  
  let subtotal = 0;
  for (const item of items) {
    const product = await db.get("SELECT selling_price FROM products WHERE id = ?", item.product_id);
    subtotal += product.selling_price * item.quantity;
  }
  
  const total = subtotal - (discount || 0);
  const remaining = total - (amount_paid || 0);
  const payment_status = remaining <= 0 ? 'paid' : (amount_paid > 0 ? 'partial' : 'unpaid');
  const invoice_number = await generateInvoiceNumber();
  
  const result = await db.run(
    `INSERT INTO sales (invoice_number, customer_id, subtotal, discount, total, amount_paid, remaining, payment_status, created_by)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [invoice_number, customer_id || null, subtotal, discount || 0, total, amount_paid || 0, remaining, payment_status, req.session.userId]
  );
  
  const saleId = result.lastID;
  
  for (const item of items) {
    const product = await db.get("SELECT selling_price FROM products WHERE id = ?", item.product_id);
    const itemTotal = product.selling_price * item.quantity;
    
    await db.run(
      "INSERT INTO sale_items (sale_id, product_id, quantity, unit_price, total) VALUES (?, ?, ?, ?, ?)",
      [saleId, item.product_id, item.quantity, product.selling_price, itemTotal]
    );
    
    await db.run("UPDATE products SET current_stock = current_stock - ? WHERE id = ?", [item.quantity, item.product_id]);
  }
  
  const newSale = await db.get("SELECT * FROM sales WHERE id = ?", saleId);
  res.json(newSale);
});

// ==================== EMPLOYEE ROUTES ====================
app.get('/api/employees', async (req, res) => {
  if (!req.session.userId) return res.status(401).json({ error: 'Unauthorized' });
  const user = await db.get("SELECT role FROM users WHERE id = ?", req.session.userId);
  if (user.role !== 'admin') return res.status(403).json({ error: 'Forbidden' });
  
  const employees = await db.all("SELECT * FROM employees ORDER BY name");
  res.json(employees);
});

app.post('/api/employees', async (req, res) => {
  if (!req.session.userId) return res.status(401).json({ error: 'Unauthorized' });
  const user = await db.get("SELECT role FROM users WHERE id = ?", req.session.userId);
  if (user.role !== 'admin') return res.status(403).json({ error: 'Forbidden' });
  
  const { name, phone, position, employee_type, salary } = req.body;
  if (!name) return res.status(400).json({ error: 'ስም ያስፈልጋል' });
  
  const result = await db.run(
    "INSERT INTO employees (name, phone, position, employee_type, salary) VALUES (?, ?, ?, ?, ?)",
    [name, phone || '', position || '', employee_type || 'sales', salary || 0]
  );
  
  // Create user account if needed
  const username = name.toLowerCase().replace(/\s/g, '') + result.lastID;
  const tempPassword = 'Temp123';
  const hashed = await bcrypt.hash(tempPassword, 10);
  
  await db.run(
    "INSERT INTO users (username, password, full_name, role, employee_type) VALUES (?, ?, ?, ?, ?)",
    [username, hashed, name, employee_type || 'staff', employee_type || 'sales']
  );
  
  const newEmployee = await db.get("SELECT * FROM employees WHERE id = ?", result.lastID);
  res.json({ employee: newEmployee, username, tempPassword });
});

app.delete('/api/employees/:id', async (req, res) => {
  if (!req.session.userId) return res.status(401).json({ error: 'Unauthorized' });
  const user = await db.get("SELECT role FROM users WHERE id = ?", req.session.userId);
  if (user.role !== 'admin') return res.status(403).json({ error: 'Forbidden' });
  
  await db.run("DELETE FROM employees WHERE id = ?", req.params.id);
  res.json({ success: true });
});

// ==================== DASHBOARD ====================
app.get('/api/dashboard', async (req, res) => {
  if (!req.session.userId) return res.status(401).json({ error: 'Unauthorized' });
  
  const today = new Date().toISOString().split('T')[0];
  const todaySales = await db.get("SELECT COALESCE(SUM(total), 0) as total FROM sales WHERE DATE(sale_date) = ?", today);
  const totalCustomers = await db.get("SELECT COUNT(*) as count FROM customers");
  const totalProducts = await db.get("SELECT COUNT(*) as count FROM products WHERE is_active = 1");
  const lowStock = await db.get("SELECT COUNT(*) as count FROM products WHERE current_stock <= min_stock");
  const recentSales = await db.all("SELECT s.*, c.name as customer_name FROM sales s LEFT JOIN customers c ON s.customer_id = c.id ORDER BY s.sale_date DESC LIMIT 5");
  
  res.json({
    todaySales: todaySales.total,
    totalCustomers: totalCustomers.count,
    totalProducts: totalProducts.count,
    lowStockCount: lowStock.count,
    recentSales
  });
});

// ==================== VEHICLES ====================
app.get('/api/vehicles', async (req, res) => {
  if (!req.session.userId) return res.status(401).json({ error: 'Unauthorized' });
  const vehicles = await db.all("SELECT * FROM vehicles ORDER BY plate_number");
  res.json(vehicles);
});

app.post('/api/vehicles', async (req, res) => {
  if (!req.session.userId) return res.status(401).json({ error: 'Unauthorized' });
  const { plate_number, model, driver_name, driver_phone } = req.body;
  if (!plate_number) return res.status(400).json({ error: 'ታርጋ ያስፈልጋል' });
  
  const result = await db.run(
    "INSERT INTO vehicles (plate_number, model, driver_name, driver_phone) VALUES (?, ?, ?, ?)",
    [plate_number, model || '', driver_name || '', driver_phone || '']
  );
  res.json({ id: result.lastID });
});

app.delete('/api/vehicles/:id', async (req, res) => {
  if (!req.session.userId) return res.status(401).json({ error: 'Unauthorized' });
  await db.run("DELETE FROM vehicles WHERE id = ?", req.params.id);
  res.json({ success: true });
});

// ==================== EXPENSES ====================
app.get('/api/expenses', async (req, res) => {
  if (!req.session.userId) return res.status(401).json({ error: 'Unauthorized' });
  const expenses = await db.all("SELECT * FROM expenses ORDER BY expense_date DESC");
  res.json(expenses);
});

app.post('/api/expenses', async (req, res) => {
  if (!req.session.userId) return res.status(401).json({ error: 'Unauthorized' });
  const { category, amount, description } = req.body;
  if (!category || !amount) return res.status(400).json({ error: 'ምድብ እና ገንዘብ ያስፈልጋል' });
  
  const result = await db.run(
    "INSERT INTO expenses (category, amount, description, created_by) VALUES (?, ?, ?, ?)",
    [category, amount, description || '', req.session.userId]
  );
  res.json({ id: result.lastID });
});

app.delete('/api/expenses/:id', async (req, res) => {
  if (!req.session.userId) return res.status(401).json({ error: 'Unauthorized' });
  await db.run("DELETE FROM expenses WHERE id = ?", req.params.id);
  res.json({ success: true });
});

// ==================== PREORDERS ====================
app.get('/api/preorders', async (req, res) => {
  if (!req.session.userId) return res.status(401).json({ error: 'Unauthorized' });
  const preorders = await db.all(`
    SELECT p.*, c.name as customer_name, pr.name as product_name
    FROM preorders p
    LEFT JOIN customers c ON p.customer_id = c.id
    LEFT JOIN products pr ON p.product_id = pr.id
    ORDER BY p.order_date DESC
  `);
  res.json(preorders);
});

app.post('/api/preorders', async (req, res) => {
  if (!req.session.userId) return res.status(401).json({ error: 'Unauthorized' });
  const { customer_id, product_id, quantity, expected_date } = req.body;
  if (!product_id || !quantity) return res.status(400).json({ error: 'ምርት እና ብዛት ያስፈልጋል' });
  
  const result = await db.run(
    "INSERT INTO preorders (customer_id, product_id, quantity, expected_date) VALUES (?, ?, ?, ?)",
    [customer_id || null, product_id, quantity, expected_date || null]
  );
  res.json({ id: result.lastID });
});

app.put('/api/preorders/:id/status', async (req, res) => {
  if (!req.session.userId) return res.status(401).json({ error: 'Unauthorized' });
  const { status } = req.body;
  await db.run("UPDATE preorders SET status = ? WHERE id = ?", [status, req.params.id]);
  res.json({ success: true });
});

app.delete('/api/preorders/:id', async (req, res) => {
  if (!req.session.userId) return res.status(401).json({ error: 'Unauthorized' });
  await db.run("DELETE FROM preorders WHERE id = ?", req.params.id);
  res.json({ success: true });
});

// ==================== WAREHOUSE ====================
app.get('/api/warehouse/summary', async (req, res) => {
  if (!req.session.userId) return res.status(401).json({ error: 'Unauthorized' });
  const summary = await db.all("SELECT id, name, code, current_stock, min_stock FROM products WHERE is_active = 1 ORDER BY current_stock ASC");
  res.json(summary);
});

app.post('/api/warehouse/add-stock', async (req, res) => {
  if (!req.session.userId) return res.status(401).json({ error: 'Unauthorized' });
  const { product_id, quantity, notes } = req.body;
  if (!product_id || !quantity) return res.status(400).json({ error: 'ምርት እና ብዛት ያስፈልጋል' });
  
  await db.run("UPDATE products SET current_stock = current_stock + ? WHERE id = ?", [quantity, product_id]);
  await db.run(
    "INSERT INTO warehouse_transactions (product_id, transaction_type, quantity, notes) VALUES (?, ?, ?, ?)",
    [product_id, 'add', quantity, notes || 'ክምችት መጨመር']
  );
  res.json({ success: true });
});

app.post('/api/warehouse/adjust', async (req, res) => {
  if (!req.session.userId) return res.status(401).json({ error: 'Unauthorized' });
  const { product_id, quantity, reason } = req.body;
  await db.run("UPDATE products SET current_stock = ? WHERE id = ?", [quantity, product_id]);
  res.json({ success: true });
});

// ==================== REPORTS ====================
app.get('/api/reports/sales', async (req, res) => {
  if (!req.session.userId) return res.status(401).json({ error: 'Unauthorized' });
  const report = await db.all(`
    SELECT DATE(sale_date) as date, COUNT(*) as count, COALESCE(SUM(total), 0) as total
    FROM sales
    GROUP BY DATE(sale_date)
    ORDER BY date DESC
    LIMIT 30
  `);
  res.json(report);
});

app.get('/api/reports/profit', async (req, res) => {
  if (!req.session.userId) return res.status(401).json({ error: 'Unauthorized' });
  const grossProfit = await db.get(`
    SELECT COALESCE(SUM(si.quantity * (p.selling_price - p.cost_price)), 0) as total
    FROM sale_items si
    JOIN products p ON si.product_id = p.id
  `);
  const totalExpenses = await db.get("SELECT COALESCE(SUM(amount), 0) as total FROM expenses");
  res.json({
    gross_profit: grossProfit.total,
    total_expenses: totalExpenses.total,
    net_profit: grossProfit.total - totalExpenses.total
  });
});

// ==================== CHANGE PASSWORD ====================
app.post('/api/profile/change-password', async (req, res) => {
  if (!req.session.userId) return res.status(401).json({ error: 'Unauthorized' });
  const { current_password, new_password } = req.body;
  
  const user = await db.get("SELECT * FROM users WHERE id = ?", req.session.userId);
  const valid = await bcrypt.compare(current_password, user.password);
  if (!valid) return res.status(401).json({ error: 'አሁን ያለው ይለፍ ቃል ተሳስቷል' });
  
  const hashed = await bcrypt.hash(new_password, 10);
  await db.run("UPDATE users SET password = ? WHERE id = ?", [hashed, req.session.userId]);
  res.json({ success: true });
});

// ==================== SERVE FRONTEND ====================
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`Server running on port ${PORT}`);
});
