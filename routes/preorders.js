const express = require('express');
const { getDb } = require('../db/pool');
const { authenticate } = require('../middleware/auth');

const router = express.Router();

router.get('/', authenticate, async (req, res) => {
  const db = getDb();
  const preorders = await db.all(`
    SELECT p.*, c.name as customer_name, pr.name as product_name
    FROM preorders p
    LEFT JOIN customers c ON p.customer_id = c.id
    LEFT JOIN products pr ON p.product_id = pr.id
    ORDER BY p.order_date DESC
  `);
  res.json(preorders);
});

router.post('/', authenticate, async (req, res) => {
  const { customer_id, product_id, quantity, expected_date, notes } = req.body;
  if (!product_id || !quantity) {
    return res.status(400).json({ error: 'ምርት እና ብዛት ያስፈልጋል' });
  }
  
  const db = getDb();
  const result = await db.run(
    'INSERT INTO preorders (customer_id, product_id, quantity, expected_date, notes) VALUES (?, ?, ?, ?, ?)',
    [customer_id || null, product_id, quantity, expected_date || null, notes || '']
  );
  
  const newPreorder = await db.get('SELECT * FROM preorders WHERE id = ?', result.lastID);
  res.status(201).json(newPreorder);
});

router.put('/:id/status', authenticate, async (req, res) => {
  const { status } = req.body;
  const db = getDb();
  
  await db.run('UPDATE preorders SET status = ? WHERE id = ?', [status, req.params.id]);
  
  // If completed, convert to sale
  if (status === 'completed') {
    const preorder = await db.get('SELECT * FROM preorders WHERE id = ?', req.params.id);
    if (preorder && preorder.product_id) {
      const product = await db.get('SELECT * FROM products WHERE id = ?', preorder.product_id);
      // Auto create sale or just update stock
      await db.run('UPDATE products SET current_stock = current_stock - ? WHERE id = ?', [preorder.quantity, preorder.product_id]);
    }
  }
  
  res.json({ success: true });
});

router.delete('/:id', authenticate, async (req, res) => {
  const db = getDb();
  await db.run('DELETE FROM preorders WHERE id = ?', req.params.id);
  res.json({ success: true });
});

module.exports = router;
