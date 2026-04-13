const express = require('express');
const { getDb } = require('../db/pool');
const { authenticate } = require('../middleware/auth');

const router = express.Router();

// Get stock movements
router.get('/movements', authenticate, async (req, res) => {
  const db = getDb();
  const movements = await db.all(`
    SELECT w.*, p.name as product_name, p.code as product_code
    FROM warehouse_transactions w
    JOIN products p ON w.product_id = p.id
    ORDER BY w.created_at DESC
    LIMIT 100
  `);
  res.json(movements);
});

// Add stock (purchase)
router.post('/add-stock', authenticate, async (req, res) => {
  const { product_id, quantity, notes } = req.body;
  if (!product_id || !quantity) {
    return res.status(400).json({ error: 'ምርት እና ብዛት ያስፈልጋል' });
  }
  
  const db = getDb();
  
  // Update product stock
  await db.run('UPDATE products SET current_stock = current_stock + ? WHERE id = ?', [quantity, product_id]);
  
  // Record transaction
  await db.run(
    'INSERT INTO warehouse_transactions (product_id, transaction_type, quantity, notes) VALUES (?, ?, ?, ?)',
    [product_id, 'purchase_in', quantity, notes || 'ግዢ']
  );
  
  res.json({ success: true });
});

// Adjust stock
router.post('/adjust', authenticate, async (req, res) => {
  const { product_id, quantity, reason } = req.body;
  if (!product_id || quantity === undefined) {
    return res.status(400).json({ error: 'ምርት እና ብዛት ያስፈልጋል' });
  }
  
  const db = getDb();
  const product = await db.get('SELECT current_stock FROM products WHERE id = ?', product_id);
  const newStock = product.current_stock + quantity;
  
  await db.run('UPDATE products SET current_stock = ? WHERE id = ?', [newStock, product_id]);
  
  await db.run(
    'INSERT INTO warehouse_transactions (product_id, transaction_type, quantity, notes) VALUES (?, ?, ?, ?)',
    [product_id, quantity > 0 ? 'adjust_in' : 'adjust_out', Math.abs(quantity), reason || 'ማስተካከያ']
  );
  
  res.json({ success: true });
});

// Stock summary
router.get('/summary', authenticate, async (req, res) => {
  const db = getDb();
  const summary = await db.all(`
    SELECT id, name, code, current_stock, min_stock, unit
    FROM products
    WHERE is_active = 1
    ORDER BY current_stock ASC
  `);
  res.json(summary);
});

module.exports = router;
