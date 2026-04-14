const express = require('express');
const { getDb } = require('../db/pool');
const { authenticate, authorize } = require('../middleware/auth');

const router = express.Router();

// Get all preorders (based on role)
router.get('/', authenticate, async (req, res) => {
  try {
    const db = getDb();
    let query = `
      SELECT p.*, 
             c.name as customer_name, 
             pr.name as product_name,
             wu.full_name as warehouse_released_by_name,
             su.full_name as sales_received_by_name
      FROM preorders p
      LEFT JOIN customers c ON p.customer_id = c.id
      LEFT JOIN products pr ON p.product_id = pr.id
      LEFT JOIN users wu ON p.warehouse_released_by = wu.id
      LEFT JOIN users su ON p.sales_received_by = su.id
    `;
    
    // Sales staff can only see their own preorders
    if (req.user.role === 'sales') {
      query += ` WHERE p.created_by = ${req.user.id}`;
    }
    
    query += ` ORDER BY p.order_date DESC`;
    
    const preorders = await db.all(query);
    res.json(preorders);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get single preorder
router.get('/:id', authenticate, async (req, res) => {
  try {
    const db = getDb();
    const preorder = await db.get('SELECT * FROM preorders WHERE id = ?', req.params.id);
    if (!preorder) return res.status(404).json({ error: 'ቅድመ ትዕዛዝ አልተገኘም' });
    res.json(preorder);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Create preorder (sales staff only)
router.post('/', authenticate, async (req, res) => {
  try {
    const { customer_id, product_id, quantity, expected_date, notes } = req.body;
    
    if (!product_id || !quantity) {
      return res.status(400).json({ error: 'ምርት እና ብዛት ያስፈልጋል' });
    }
    
    // Only sales staff can create preorders
    if (req.user.role !== 'sales' && req.user.role !== 'admin') {
      return res.status(403).json({ error: 'ቅድመ ትዕዛዝ የመፍጠር ፈቃድ የለዎትም' });
    }
    
    const db = getDb();
    
    // Check if product exists
    const product = await db.get('SELECT * FROM products WHERE id = ?', product_id);
    if (!product) {
      return res.status(404).json({ error: 'ምርት አልተገኘም' });
    }
    
    const result = await db.run(
      `INSERT INTO preorders (customer_id, product_id, quantity, expected_date, notes, created_by) 
       VALUES (?, ?, ?, ?, ?, ?)`,
      [customer_id || null, product_id, quantity, expected_date || null, notes || '', req.user.id]
    );
    
    const newPreorder = await db.get('SELECT * FROM preorders WHERE id = ?', result.lastID);
    res.status(201).json(newPreorder);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Warehouse staff releases item to sales staff
router.put('/:id/warehouse-release', authenticate, async (req, res) => {
  try {
    const { id } = req.params;
    
    // Only warehouse staff can release
    if (req.user.role !== 'warehouse' && req.user.role !== 'admin') {
      return res.status(403).json({ error: 'ይህን እርምጃ ማድረግ አይችሉም' });
    }
    
    const db = getDb();
    const preorder = await db.get('SELECT * FROM preorders WHERE id = ?', id);
    
    if (!preorder) {
      return res.status(404).json({ error: 'ቅድመ ትዕዛዝ አልተገኘም' });
    }
    
    if (preorder.warehouse_released) {
      return res.status(400).json({ error: 'ይህ ቅድመ ትዕዛዝ ቀድሞ ከመጋዘን ተለቋል' });
    }
    
    await db.run(
      `UPDATE preorders SET 
       warehouse_released = 1, 
       warehouse_released_by = ?, 
       warehouse_released_at = CURRENT_TIMESTAMP 
       WHERE id = ?`,
      [req.user.id, id]
    );
    
    // Update stock
    await db.run('UPDATE products SET current_stock = current_stock - ? WHERE id = ?', 
      [preorder.quantity, preorder.product_id]);
    
    res.json({ success: true, message: 'ከመጋዘን ተለቋል' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Sales staff confirms receipt from warehouse
router.put('/:id/sales-receive', authenticate, async (req, res) => {
  try {
    const { id } = req.params;
    
    // Only sales staff can confirm receipt
    if (req.user.role !== 'sales' && req.user.role !== 'admin') {
      return res.status(403).json({ error: 'ይህን እርምጃ ማድረግ አይችሉም' });
    }
    
    const db = getDb();
    const preorder = await db.get('SELECT * FROM preorders WHERE id = ?', id);
    
    if (!preorder) {
      return res.status(404).json({ error: 'ቅድመ ትዕዛዝ አልተገኘም' });
    }
    
    if (!preorder.warehouse_released) {
      return res.status(400).json({ error: 'እቃው ገና ከመጋዘን አልተለቀቀም' });
    }
    
    if (preorder.sales_received) {
      return res.status(400).json({ error: 'ይህ ቅድመ ትዕዛዝ ቀድሞ ተቀብለዋል' });
    }
    
    await db.run(
      `UPDATE preorders SET 
       sales_received = 1, 
       sales_received_by = ?, 
       sales_received_at = CURRENT_TIMESTAMP,
       status = 'completed'
       WHERE id = ?`,
      [req.user.id, id]
    );
    
    res.json({ success: true, message: 'እቃው ተቀብሏል' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Delete preorder
router.delete('/:id', authenticate, async (req, res) => {
  try {
    const db = getDb();
    await db.run('DELETE FROM preorders WHERE id = ?', req.params.id);
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
