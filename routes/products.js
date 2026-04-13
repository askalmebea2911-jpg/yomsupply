const express = require('express');
const { getDb } = require('../db/pool');
const { authenticate } = require('../middleware/auth');
const upload = require('../middleware/upload');

const router = express.Router();

// Get all products
router.get('/', authenticate, async (req, res) => {
  const db = getDb();
  const products = await db.all('SELECT * FROM products ORDER BY name');
  res.json(products);
});

// Get low stock products
router.get('/low-stock', authenticate, async (req, res) => {
  const db = getDb();
  const products = await db.all('SELECT * FROM products WHERE current_stock <= min_stock AND is_active = 1');
  res.json(products);
});

// Get single product
router.get('/:id', authenticate, async (req, res) => {
  const db = getDb();
  const product = await db.get('SELECT * FROM products WHERE id = ?', req.params.id);
  if (!product) return res.status(404).json({ error: 'ምርት አልተገኘም' });
  res.json(product);
});

// Create product
router.post('/', authenticate, upload.single('image'), async (req, res) => {
  const { name, code, category, unit, selling_price, cost_price, current_stock, min_stock } = req.body;
  
  if (!name || !selling_price) {
    return res.status(400).json({ error: 'ስም እና የሽያጭ ዋጋ ያስፈልጋል' });
  }
  
  const db = getDb();
  const image = req.file ? req.file.filename : null;
  
  const result = await db.run(
    'INSERT INTO products (name, code, category, unit, selling_price, cost_price, current_stock, min_stock, image) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
    [name, code || null, category || null, unit || null, selling_price, cost_price || 0, current_stock || 0, min_stock || 0, image]
  );
  
  const newProduct = await db.get('SELECT * FROM products WHERE id = ?', result.lastID);
  res.status(201).json(newProduct);
});

// Update product
router.put('/:id', authenticate, upload.single('image'), async (req, res) => {
  const { name, code, category, unit, selling_price, cost_price, current_stock, min_stock, is_active } = req.body;
  const db = getDb();
  
  let imageUpdate = '';
  let params = [];
  
  if (req.file) {
    imageUpdate = ', image = ?';
    params = [name, code, category, unit, selling_price, cost_price, current_stock, min_stock, is_active, req.file.filename, req.params.id];
  } else {
    params = [name, code, category, unit, selling_price, cost_price, current_stock, min_stock, is_active, req.params.id];
  }
  
  await db.run(
    `UPDATE products SET name = ?, code = ?, category = ?, unit = ?, selling_price = ?, cost_price = ?, current_stock = ?, min_stock = ?, is_active = ?${imageUpdate} WHERE id = ?`,
    params
  );
  
  const updated = await db.get('SELECT * FROM products WHERE id = ?', req.params.id);
  res.json(updated);
});

// Delete product
router.delete('/:id', authenticate, async (req, res) => {
  const db = getDb();
  await db.run('DELETE FROM products WHERE id = ?', req.params.id);
  res.json({ success: true });
});

module.exports = router;
