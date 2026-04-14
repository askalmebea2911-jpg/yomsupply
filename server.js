const express = require('express');
const session = require('express-session');
const path = require('path');
const fs = require('fs');
const sqlite3 = require('sqlite3');
const { open } = require('sqlite');
const bcrypt = require('bcryptjs');

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

// Database
let db;

async function initDB() {
  db = await open({
    filename: './yom_sales.db',
    driver: sqlite3.Database
  });
  
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
      created_by INTEGER,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
    
    -- Credit transactions table
    CREATE TABLE IF NOT EXISTS credit_transactions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      customer_id INTEGER NOT NULL,
      amount REAL NOT NULL,
      type TEXT NOT NULL,
      sale_id INTEGER,
      notes TEXT,
      created_by INTEGER,
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
      notes TEXT,
      created_by INTEGER,
      warehouse_released INTEGER DEFAULT 0,
      warehouse_released_by INTEGER,
      sales_received INTEGER DEFAULT 0,
      sales_received_by INTEGER
    );
    
    -- Warehouse transactions
    CREATE TABLE IF NOT EXISTS warehouse_transactions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      product_id INTEGER NOT NULL,
      transaction_type TEXT NOT NULL,
      quantity REAL NOT NULL,
      notes TEXT,
      created_by INTEGER,
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

// Initialize database and start server
initDB().catch(err => {
  console.error('Database init error:', err);
  process.exit(1);
});

// ==================== AUTH ROUTES ====================
app.post('/api/auth/login', async (req, res) => {
  try {
    const { username, password } = req.body;
    console.log('Login attempt:', username);
    
    const user = await db.get("SELECT * FROM users WHERE username = ? AND is_active = 1", username);
    if (!user) {
      console.log('User not found:', username);
      return res.status(401).json({ error: 'የተጠቃሚ ስም ወይም ይለፍ ቃል ተሳስቷል' });
    }
    
    const valid = await bcrypt.compare(password, user.password);
    if (!valid) {
      console.log('Invalid password for:', username);
      return res.status(401).json({ error: 'የተጠቃሚ ስም ወይም ይለፍ ቃል ተሳስቷል' });
    }
    
    req.session.userId = user.id;
    delete user.password;
    console.log('Login successful:', username);
    res.json({ success: true, user });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ error: 'የሰርቨር ስህተት' });
  }
});

app.get('/api/auth/me', async (req, res) => {
  try {
    if (!req.session.userId) {
      return res.status(401).json({ error: 'Not logged in' });
    }
    const user = await db.get("SELECT id, username, full_name, role, employee_type FROM users WHERE id = ?", req.session.userId);
    if (!user) {
      req.session.destroy();
      return res.status(401).json({ error: 'User not found' });
    }
    res.json(user);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/auth/logout', (req, res) => {
  req.session.destroy();
  res.json({ success: true });
});

// ==================== CUSTOMER ROUTES ====================
app.get('/api/customers', async (req, res) => {
  if (!req.session.userId) return res.status(401).json({ error: 'Unauthorized' });
  const customers = await db.all(`
    SELECT c.*, u.full_name as created_by_name 
    FROM customers c 
    LEFT JOIN users u ON c.created_by = u.id 
    ORDER BY c.name
  `);
  res.json(customers);
});

app.post('/api/customers', async (req, res) => {
  if (!req.session.userId) return res.status(401).json({ error: 'Unauthorized' });
  const { name, phone, address, email, credit_limit } = req.body;
  if (!name) return res.status(400).json({ error: 'ስም ያስፈልጋል' });
  
  const result = await db.run(
    "INSERT INTO customers (name, phone, address, email, credit_limit, created_by) VALUES (?, ?, ?, ?, ?, ?)",
    [name, phone || '', address || '', email || '', credit_limit || 0, req.session.userId]
  );
  const newCustomer = await db.get("SELECT * FROM customers WHERE id = ?", result.lastID);
  res.json(newCustomer);
});

app.put('/api/customers/:id', async (req, res) => {
  if (!req.session.userId) return res.status(401).json({ error: 'Unauthorized' });
  const { name, phone, address, email, credit_limit } = req.body;
  await db.run(
    "UPDATE customers SET name = ?, phone = ?, address = ?, email = ?, credit_limit = ? WHERE id = ?",
    [name, phone, address, email, credit_limit, req.params.id]
  );
  res.json({ success: true });
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
  const user = await db.get("SELECT role FROM users WHERE id = ?", req.session.userId);
  if (user.role !== 'admin') return res.status(403).json({ error: 'Forbidden' });
  
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
  const user = await db.get("SELECT role FROM users WHERE id = ?", req.session.userId);
  if (user.role !== 'admin') return res.status(403).json({ error: 'Forbidden' });
  
  const { selling_price, name, code, category, cost_price, min_stock } = req.body;
  await db.run(
    "UPDATE products SET name = ?, code = ?, category = ?, selling_price = ?, cost_price = ?, min_stock = ? WHERE id = ?",
    [name, code, category, selling_price, cost_price, min_stock, req.params.id]
  );
  res.json({ success: true });
});

app.delete('/api/products/:id', async (req, res) => {
  if (!req.session.userId) return res.status(401).json({ error: 'Unauthorized' });
  const user = await db.get("SELECT role FROM users WHERE id = ?", req.session.userId);
  if (user.role !== 'admin') return res.status(403).json({ error: 'Forbidden' });
  
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
  const user = await db.get("SELECT role FROM users WHERE id = ?", req.session.userId);
  
  let query = `
    SELECT s.*, c.name as customer_name, u.full_name as created_by_name 
    FROM sales s 
    LEFT JOIN customers c ON s.customer_id = c.id 
    LEFT JOIN users u ON s.created_by = u.id
  `;
  
  if (user.role === 'sales') {
    query += ` WHERE s.created_by = ${req.session.userId}`;
  }
  
  query += ` ORDER BY s.sale_date DESC`;
  
  const sales = await db.all(query);
  res.json(sales);
});

app.post('/api/sales', async (req, res) => {
  if (!req.session.userId) return res.status(401).json({ error: 'Unauthorized' });
  const user = await db.get("SELECT role, employee_type FROM users WHERE id = ?", req.session.userId);
  
  if (user.role !== 'sales' && user.employee_type !== 'sales') {
    return res.status(403).json({ error: 'የሽያጭ ሰራተኛ ብቻ ሽያጭ መሸጥ ይችላል' });
  }
  
  const { customer_id, items, discount, amount_paid } = req.body;
  
  if (!items || items.length === 0) {
    return res.status(400).json({ error: 'ቢያንስ አንድ ምርት ያስፈልጋል' });
  }
  
  let subtotal = 0;
  for (const item of items) {
    const product = await db.get("SELECT selling_price, current_stock FROM products WHERE id = ?", item.product_id);
    if (!product) return res.status(400).json({ error: 'ምርት አልተገኘም' });
    if (product.current_stock < item.quantity) {
      return res.status(400).json({ error: 'በቂ ክምችት የለም' });
    }
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
    await db.run(
      "INSERT INTO warehouse_transactions (product_id, transaction_type, quantity, notes, created_by) VALUES (?, ?, ?, ?, ?)",
      [item.product_id, 'sale_out', item.quantity, `ሽያጭ ${invoice_number}`, req.session.userId]
    );
  }
  
  if (customer_id && remaining > 0) {
    await db.run("UPDATE customers SET current_credit = current_credit + ? WHERE id = ?", [remaining, customer_id]);
    await db.run(
      "INSERT INTO credit_transactions (customer_id, amount, type, sale_id, notes, created_by) VALUES (?, ?, ?, ?, ?, ?)",
      [customer_id, remaining, 'credit', saleId, `ከሽያጭ ${invoice_number}`, req.session.userId]
    );
  }
  
  const newSale = await db.get("SELECT * FROM sales WHERE id = ?", saleId);
  res.json(newSale);
});

app.put('/api/sales/:id/payment', async (req, res) => {
  if (!req.session.userId) return res.status(401).json({ error: 'Unauthorized' });
  const { amount } = req.body;
  
  const sale = await db.get("SELECT * FROM sales WHERE id = ?", req.params.id);
  if (!sale) return res.status(404).json({ error: 'ሽያጭ አልተገኘም' });
  
  const newPaid = sale.amount_paid + amount;
  const newRemaining = sale.total - newPaid;
  const payment_status = newRemaining <= 0 ? 'paid' : 'partial';
  
  await db.run(
    "UPDATE sales SET amount_paid = ?, remaining = ?, payment_status = ? WHERE id = ?",
    [newPaid, newRemaining, payment_status, req.params.id]
  );
  
  if (sale.customer_id) {
    await db.run("UPDATE customers SET current_credit = current_credit - ? WHERE id = ?", [amount, sale.customer_id]);
    await db.run(
      "INSERT INTO credit_transactions (customer_id, amount, type, sale_id, notes, created_by) VALUES (?, ?, ?, ?, ?, ?)",
      [sale.customer_id, amount, 'payment', sale.id, `ክፍያ ለሽያጭ ${sale.invoice_number}`, req.session.userId]
    );
  }
  
  res.json({ success: true });
});

// ==================== EMPLOYEE ROUTES ====================
app.get('/api/employees', async (req, res) => {
  if (!req.session.userId) return res.status(401).json({ error: 'Unauthorized' });
  const user = await db.get("SELECT role FROM users WHERE id = ?", req.session.userId);
  if (user.role !== 'admin') return res.status(403).json({ error: 'Forbidden' });
  
  const employees = await db.all(`
    SELECT e.*, u.username, u.id as user_id 
    FROM employees e 
    LEFT JOIN users u ON e.user_id = u.id 
    ORDER BY e.name
  `);
  res.json(employees);
});

app.post('/api/employees', async (req, res) => {
  if (!req.session.userId) return res.status(401).json({ error: 'Unauthorized' });
  const admin = await db.get("SELECT role FROM users WHERE id = ?", req.session.userId);
  if (admin.role !== 'admin') return res.status(403).json({ error: 'Forbidden' });
  
  const { name, phone, position, employee_type, salary } = req.body;
  if (!name) return res.status(400).json({ error: 'ስም ያስፈልጋል' });
  
  const result = await db.run(
    "INSERT INTO employees (name, phone, position, employee_type, salary) VALUES (?, ?, ?, ?, ?)",
    [name, phone || '', position || '', employee_type || 'sales', salary || 0]
  );
  
  const username = name.toLowerCase().replace(/\s/g, '') + result.lastID;
  const tempPassword = 'Temp123';
  const hashed = await bcrypt.hash(tempPassword, 10);
  
  let role = 'staff';
  if (employee_type === 'admin') role = 'admin';
  else if (employee_type === 'accountant') role = 'accountant';
  else if (employee_type === 'warehouse') role = 'warehouse';
  else if (employee_type === 'sales') role = 'sales';
  
  await db.run(
    "INSERT INTO users (username, password, full_name, role, employee_type, employee_id) VALUES (?, ?, ?, ?, ?, ?)",
    [username, hashed, name, role, employee_type || 'sales', result.lastID]
  );
  
  const user = await db.get("SELECT id FROM users WHERE employee_id = ?", result.lastID);
  await db.run("UPDATE employees SET user_id = ? WHERE id = ?", [user.id, result.lastID]);
  
  const newEmployee = await db.get("SELECT * FROM employees WHERE id = ?", result.lastID);
  res.json({ employee: newEmployee, username, tempPassword });
});

app.put('/api/employees/:id', async (req, res) => {
  if (!req.session.userId) return res.status(401).json({ error: 'Unauthorized' });
  const admin = await db.get("SELECT role FROM users WHERE id = ?", req.session.userId);
  if (admin.role !== 'admin') return res.status(403).json({ error: 'Forbidden' });
  
  const { name, phone, position, employee_type, salary, is_active } = req.body;
  await db.run(
    "UPDATE employees SET name = ?, phone = ?, position = ?, employee_type = ?, salary = ?, is_active = ? WHERE id = ?",
    [name, phone, position, employee_type, salary, is_active, req.params.id]
  );
  res.json({ success: true });
});

app.delete('/api/employees/:id', async (req, res) => {
  if (!req.session.userId) return res.status(401).json({ error: 'Unauthorized' });
  const admin = await db.get("SELECT role FROM users WHERE id = ?", req.session.userId);
  if (admin.role !== 'admin') return res.status(403).json({ error: 'Forbidden' });
  
  await db.run("DELETE FROM users WHERE employee_id = ?", req.params.id);
  await db.run("DELETE FROM employees WHERE id = ?", req.params.id);
  res.json({ success: true });
});

app.post('/api/employees/:id/reset-password', async (req, res) => {
  if (!req.session.userId) return res.status(401).json({ error: 'Unauthorized' });
  const admin = await db.get("SELECT role FROM users WHERE id = ?", req.session.userId);
  if (admin.role !== 'admin') return res.status(403).json({ error: 'Forbidden' });
  
  const tempPassword = 'Temp' + Math.floor(1000 + Math.random() * 9000);
  const hashed = await bcrypt.hash(tempPassword, 10);
  await db.run("UPDATE users SET password = ? WHERE employee_id = ?", [hashed, req.params.id]);
  res.json({ success: true, tempPassword });
});

app.get('/api/employees/types/list', async (req, res) => {
  const types = [
    { value: 'sales', label: 'የሽያጭ ሰራተኛ', code: 'SAL' },
    { value: 'warehouse', label: 'የመጋዘን ሰራተኛ', code: 'WRH' },
    { value: 'accountant', label: 'ሂሳብ ሰራተኛ', code: 'ACC' },
    { value: 'admin', label: 'አስተዳዳሪ', code: 'ADM' }
  ];
  res.json(types);
});

// ==================== VEHICLE ROUTES ====================
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

app.put('/api/vehicles/:id', async (req, res) => {
  if (!req.session.userId) return res.status(401).json({ error: 'Unauthorized' });
  const { plate_number, model, driver_name, driver_phone, status } = req.body;
  await db.run(
    "UPDATE vehicles SET plate_number = ?, model = ?, driver_name = ?, driver_phone = ?, status = ? WHERE id = ?",
    [plate_number, model, driver_name, driver_phone, status, req.params.id]
  );
  res.json({ success: true });
});

app.delete('/api/vehicles/:id', async (req, res) => {
  if (!req.session.userId) return res.status(401).json({ error: 'Unauthorized' });
  await db.run("DELETE FROM vehicles WHERE id = ?", req.params.id);
  res.json({ success: true });
});

// ==================== EXPENSE ROUTES ====================
app.get('/api/expenses', async (req, res) => {
  if (!req.session.userId) return res.status(401).json({ error: 'Unauthorized' });
  const expenses = await db.all(`
    SELECT e.*, u.full_name as created_by_name 
    FROM expenses e 
    LEFT JOIN users u ON e.created_by = u.id 
    ORDER BY e.expense_date DESC
  `);
  res.json(expenses);
});

app.post('/api/expenses', async (req, res) => {
  if (!req.session.userId) return res.status(401).json({ error: 'Unauthorized' });
  const user = await db.get("SELECT role, employee_type FROM users WHERE id = ?", req.session.userId);
  
  if (user.role !== 'admin' && user.employee_type !== 'accountant') {
    return res.status(403).json({ error: 'ወጪ መዝገብ የሚችሉት አስተዳዳሪ እና ሂሳብ ሰራተኛ ብቻ ናቸው' });
  }
  
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

// ==================== PREORDER ROUTES ====================
app.get('/api/preorders', async (req, res) => {
  if (!req.session.userId) return res.status(401).json({ error: 'Unauthorized' });
  const preorders = await db.all(`
    SELECT p.*, c.name as customer_name, pr.name as product_name,
           u.full_name as created_by_name,
           wu.full_name as warehouse_released_by_name,
           su.full_name as sales_received_by_name
    FROM preorders p
    LEFT JOIN customers c ON p.customer_id = c.id
    LEFT JOIN products pr ON p.product_id = pr.id
    LEFT JOIN users u ON p.created_by = u.id
    LEFT JOIN users wu ON p.warehouse_released_by = wu.id
    LEFT JOIN users su ON p.sales_received_by = su.id
    ORDER BY p.order_date DESC
  `);
  res.json(preorders);
});

app.post('/api/preorders', async (req, res) => {
  if (!req.session.userId) return res.status(401).json({ error: 'Unauthorized' });
  const user = await db.get("SELECT role, employee_type FROM users WHERE id = ?", req.session.userId);
  
  if (user.role !== 'sales' && user.employee_type !== 'sales' && user.role !== 'admin') {
    return res.status(403).json({ error: 'ቅድመ ትዕዛዝ መፍጠር የሚችሉት የሽያጭ ሰራተኞች ብቻ ናቸው' });
  }
  
  const { customer_id, product_id, quantity, expected_date } = req.body;
  if (!product_id || !quantity) return res.status(400).json({ error: 'ምርት እና ብዛት ያስፈልጋል' });
  
  const result = await db.run(
    "INSERT INTO preorders (customer_id, product_id, quantity, expected_date, created_by) VALUES (?, ?, ?, ?, ?)",
    [customer_id || null, product_id, quantity, expected_date || null, req.session.userId]
  );
  res.json({ id: result.lastID });
});

app.put('/api/preorders/:id/warehouse-release', async (req, res) => {
  if (!req.session.userId) return res.status(401).json({ error: 'Unauthorized' });
  const user = await db.get("SELECT role, employee_type FROM users WHERE id = ?", req.session.userId);
  
  if (user.role !== 'warehouse' && user.employee_type !== 'warehouse' && user.role !== 'admin') {
    return res.status(403).json({ error: 'ከመጋዘን ማውጣት የሚችሉት የመጋዘን ሰራተኞች ብቻ ናቸው' });
  }
  
  await db.run(
    "UPDATE preorders SET warehouse_released = 1, warehouse_released_by = ? WHERE id = ?",
    [req.session.userId, req.params.id]
  );
  res.json({ success: true });
});

app.put('/api/preorders/:id/sales-receive', async (req, res) => {
  if (!req.session.userId) return res.status(401).json({ error: 'Unauthorized' });
  const user = await db.get("SELECT role, employee_type FROM users WHERE id = ?", req.session.userId);
  
  if (user.role !== 'sales' && user.employee_type !== 'sales' && user.role !== 'admin') {
    return res.status(403).json({ error: 'መቀበል የሚችሉት የሽያጭ ሰራተኞች ብቻ ናቸው' });
  }
  
  await db.run(
    "UPDATE preorders SET sales_received = 1, sales_received_by = ?, status = 'completed' WHERE id = ?",
    [req.session.userId, req.params.id]
  );
  res.json({ success: true });
});

app.delete('/api/preorders/:id', async (req, res) => {
  if (!req.session.userId) return res.status(401).json({ error: 'Unauthorized' });
  await db.run("DELETE FROM preorders WHERE id = ?", req.params.id);
  res.json({ success: true });
});

// ==================== WAREHOUSE ROUTES ====================
app.get('/api/warehouse/summary', async (req, res) => {
  if (!req.session.userId) return res.status(401).json({ error: 'Unauthorized' });
  const summary = await db.all("SELECT id, name, code, current_stock, min_stock FROM products WHERE is_active = 1 ORDER BY current_stock ASC");
  res.json(summary);
});

app.post('/api/warehouse/add-stock', async (req, res) => {
  if (!req.session.userId) return res.status(401).json({ error: 'Unauthorized' });
  const user = await db.get("SELECT role, employee_type FROM users WHERE id = ?", req.session.userId);
  
  if (user.role !== 'warehouse' && user.employee_type !== 'warehouse' && user.role !== 'admin') {
    return res.status(403).json({ error: 'ክምችት መጨመር የሚችሉት የመጋዘን ሰራተኞች ብቻ ናቸው' });
  }
  
  const { product_id, quantity, notes } = req.body;
  if (!product_id || !quantity) return res.status(400).json({ error: 'ምርት እና ብዛት ያስፈልጋል' });
  
  await db.run("UPDATE products SET current_stock = current_stock + ? WHERE id = ?", [quantity, product_id]);
  await db.run(
    "INSERT INTO warehouse_transactions (product_id, transaction_type, quantity, notes, created_by) VALUES (?, ?, ?, ?, ?)",
    [product_id, 'add_stock', quantity, notes || 'ክምችት መጨመር', req.session.userId]
  );
  res.json({ success: true });
});

app.post('/api/warehouse/adjust', async (req, res) => {
  if (!req.session.userId) return res.status(401).json({ error: 'Unauthorized' });
  const user = await db.get("SELECT role FROM users WHERE id = ?", req.session.userId);
  if (user.role !== 'admin') return res.status(403).json({ error: 'Forbidden' });
  
  const { product_id, quantity, reason } = req.body;
  await db.run("UPDATE products SET current_stock = ? WHERE id = ?", [quantity, product_id]);
  await db.run(
    "INSERT INTO warehouse_transactions (product_id, transaction_type, quantity, notes, created_by) VALUES (?, ?, ?, ?, ?)",
    [product_id, 'adjust', Math.abs(quantity), reason || 'ማስተካከያ', req.session.userId]
  );
  res.json({ success: true });
});

// ==================== DASHBOARD ====================
app.get('/api/dashboard', async (req, res) => {
  if (!req.session.userId) return res.status(401).json({ error: 'Unauthorized' });
  
  const today = new Date().toISOString().split('T')[0];
  const todaySales = await db.get("SELECT COALESCE(SUM(total), 0) as total FROM sales WHERE DATE(sale_date) = ?", today);
  const monthStart = new Date().getFullYear() + '-' + String(new Date().getMonth() + 1).padStart(2, '0') + '-01';
  const monthSales = await db.get("SELECT COALESCE(SUM(total), 0) as total FROM sales WHERE sale_date >= ?", monthStart);
  const totalCustomers = await db.get("SELECT COUNT(*) as count FROM customers");
  const totalProducts = await db.get("SELECT COUNT(*) as count FROM products WHERE is_active = 1");
  const lowStock = await db.get("SELECT COUNT(*) as count FROM products WHERE current_stock <= min_stock AND is_active = 1");
  const todayExpenses = await db.get("SELECT COALESCE(SUM(amount), 0) as total FROM expenses WHERE expense_date = ?", today);
  const pendingPreorders = await db.get("SELECT COUNT(*) as count FROM preorders WHERE status = 'pending'");
  
  const recentSales = await db.all(`
    SELECT s.*, c.name as customer_name 
    FROM sales s 
    LEFT JOIN customers c ON s.customer_id = c.id 
    ORDER BY s.sale_date DESC 
    LIMIT 10
  `);
  
  res.json({
    todaySales: todaySales.total,
    monthSales: monthSales.total,
    totalCustomers: totalCustomers.count,
    totalProducts: totalProducts.count,
    lowStockCount: lowStock.count,
    todayExpenses: todayExpenses.total,
    pendingPreorders: pendingPreorders.count,
    recentSales
  });
});

// ==================== REPORTS ====================
app.get('/api/reports/sales', async (req, res) => {
  if (!req.session.userId) return res.status(401).json({ error: 'Unauthorized' });
  const { start_date, end_date, period } = req.query;
  
  let groupBy = "DATE(sale_date)";
  if (period === 'month') groupBy = "strftime('%Y-%m', sale_date)";
  else if (period === 'year') groupBy = "strftime('%Y', sale_date)";
  
  let query = `
    SELECT ${groupBy} as date, 
           COUNT(*) as count, 
           COALESCE(SUM(total), 0) as total,
           COALESCE(SUM(amount_paid), 0) as paid
    FROM sales
    WHERE 1=1
  `;
  if (start_date) query += ` AND DATE(sale_date) >= '${start_date}'`;
  if (end_date) query += ` AND DATE(sale_date) <= '${end_date}'`;
  query += ` GROUP BY ${groupBy} ORDER BY date DESC`;
  
  const report = await db.all(query);
  res.json(report);
});

app.get('/api/reports/expenses', async (req, res) => {
  if (!req.session.userId) return res.status(401).json({ error: 'Unauthorized' });
  const { start_date, end_date, period, category } = req.query;
  
  let groupBy = "DATE(expense_date)";
  if (period === 'month') groupBy = "strftime('%Y-%m', expense_date)";
  else if (period === 'year') groupBy = "strftime('%Y', expense_date)";
  
  let query = `
    SELECT ${groupBy} as date, 
           category,
           COUNT(*) as count, 
           COALESCE(SUM(amount), 0) as total
    FROM expenses
    WHERE 1=1
  `;
  if (start_date) query += ` AND DATE(expense_date) >= '${start_date}'`;
  if (end_date) query += ` AND DATE(expense_date) <= '${end_date}'`;
  if (category && category !== 'all') query += ` AND category = '${category}'`;
  query += ` GROUP BY ${groupBy}, category ORDER BY date DESC`;
  
  const report = await db.all(query);
  res.json(report);
});

app.get('/api/reports/profit', async (req, res) => {
  if (!req.session.userId) return res.status(401).json({ error: 'Unauthorized' });
  const { start_date, end_date } = req.query;
  
  let salesQuery = `
    SELECT COALESCE(SUM(si.quantity * (p.selling_price - p.cost_price)), 0) as gross_profit
    FROM sale_items si
    JOIN products p ON si.product_id = p.id
    JOIN sales s ON si.sale_id = s.id
    WHERE 1=1
  `;
  if (start_date) salesQuery += ` AND DATE(s.sale_date) >= '${start_date}'`;
  if (end_date) salesQuery += ` AND DATE(s.sale_date) <= '${end_date}'`;
  
  const grossProfit = await db.get(salesQuery);
  
  let expensesQuery = "SELECT COALESCE(SUM(amount), 0) as total FROM expenses WHERE 1=1";
  if (start_date) expensesQuery += ` AND expense_date >= '${start_date}'`;
  if (end_date) expensesQuery += ` AND expense_date <= '${end_date}'`;
  
  const expenses = await db.get(expensesQuery);
  
  res.json({
    gross_profit: grossProfit.gross_profit || 0,
    total_expenses: expenses.total || 0,
    net_profit: (grossProfit.gross_profit || 0) - (expenses.total || 0)
  });
});

app.get('/api/reports/employee-performance', async (req, res) => {
  if (!req.session.userId) return res.status(401).json({ error: 'Unauthorized' });
  const user = await db.get("SELECT role FROM users WHERE id = ?", req.session.userId);
  if (user.role !== 'admin') return res.status(403).json({ error: 'Forbidden' });
  
  const { start_date, end_date } = req.query;
  
  let query = `
    SELECT u.id, u.full_name, u.employee_type,
           COUNT(s.id) as sale_count,
           COALESCE(SUM(s.total), 0) as total_sales,
           COALESCE(SUM(s.amount_paid), 0) as total_collected
    FROM users u
    LEFT JOIN sales s ON u.id = s.created_by
    WHERE u.role = 'sales' OR u.employee_type = 'sales'
  `;
  if (start_date) query += ` AND DATE(s.sale_date) >= '${start_date}'`;
  if (end_date) query += ` AND DATE(s.sale_date) <= '${end_date}'`;
  query += ` GROUP BY u.id ORDER BY total_sales DESC`;
  
  const report = await db.all(query);
  res.json(report);
});

// ==================== CHANGE PASSWORD ====================
app.post('/api/profile/change-password', async (req, res) => {
  if (!req.session.userId) return res.status(401).json({ error: 'Unauthorized' });
  const { current_password, new_password } = req.body;
  
  const user = await db.get("SELECT * FROM users WHERE id = ?", req.session.userId);
  const valid = await bcrypt.compare(current_password, user.password);
  if (!valid) return res.status(401).json({ error: 'አሁን ያለው ይለፍ ቃል ተሳስቷል' });
  
  if (new_password.length < 4) {
    return res.status(400).json({ error: 'አዲስ ይለፍ ቃል ቢያንስ 4 ፊደላት ሊኖረው ይገባል' });
  }
  
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
