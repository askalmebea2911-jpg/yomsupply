const express = require('express');
const { getDb } = require('../db/pool');
const { authenticate } = require('../middleware/auth');

const router = express.Router();

async function generateInvoiceNumber() {
  const db = getDb();
  const result = await db.get("SELECT invoice_number FROM sales ORDER BY id DESC LIMIT 1");
  if (!result) return 'INV-00001';
  const lastNum = parseInt(result.invoice_number.split('-')[1]);
  const newNum = String(lastNum + 1).padStart(5, '0');
  return `INV-${newNum}`;
}

// Get all sales
router.get('/', authenticate, async (req, res) => {
  const db = getDb();
  const sales = await db.all(`
    SELECT s.*, c.name as customer_name, u.full_name as created_by_name
    FROM sales s
    LEFT JOIN customers c ON s.customer_id = c.id
    LEFT JOIN users u ON s.created_by = u.id
    ORDER BY s.sale_date DESC
  `);
  res.json(sales);
});

// Get single sale with items
router.get('/:id', authenticate, async (req, res) => {
  const db = getDb();
  const sale = await db.get(`
    SELECT s.*, c.name as customer_name, u.full_name as created_by_name
    FROM sales s
    LEFT JOIN customers c ON s.customer_id = c.id
    LEFT JOIN users u ON s.created_by = u.id
    WHERE s.id = ?
  `, req.params.id);
  
  if (!sale) return res.status(404).json({ error: 'ሽያጭ አልተገኘም' });
  
  const items = await db.all(`
    SELECT si.*, p.name as product_name, p.code as product_code
    FROM sale_items si
    JOIN products p ON si.product_id = p.id
    WHERE si.sale_id = ?
  `, req.params.id);
  
  res.json({ ...sale, items });
});

// Create sale
router.post('/', authenticate, async (req, res) => {
  const { customer_id, items, discount, amount_paid, payment_method, notes } = req.body;
  
  if (!items || !items.length) {
    return res.status(400).json({ error: 'ቢያንስ አንድ ምርት ያስፈልጋል' });
  }
  
  const db = getDb();
  const invoice_number = await generateInvoiceNumber();
  
  let subtotal = 0;
  for (const item of items) {
    const product = await db.get('SELECT selling_price, current_stock FROM products WHERE id = ?', item.product_id);
    if (!product) return res.status(400).json({ error: 'ምርት አልተገኘም' });
    if (product.current_stock < item.quantity) {
      return res.status(400).json({ error: 'በቂ ክምችት የለም' });
    }
    subtotal += product.selling_price * item.quantity;
  }
  
  const total = subtotal - (discount || 0);
  const remaining = total - (amount_paid || 0);
  const payment_status = remaining <= 0 ? 'paid' : (amount_paid > 0 ? 'partial' : 'unpaid');
  
  const result = await db.run(
    `INSERT INTO sales (invoice_number, customer_id, subtotal, discount, total, amount_paid, remaining, payment_status, payment_method, notes, created_by)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [invoice_number, customer_id || null, subtotal, discount || 0, total, amount_paid || 0, remaining, payment_status, payment_method || null, notes || null, req.user.id]
  );
  
  const saleId = result.lastID;
  
  for (const item of items) {
    const product = await db.get('SELECT selling_price FROM products WHERE id = ?', item.product_id);
    const unit_price = product.selling_price;
    const itemTotal = unit_price * item.quantity;
    
    await db.run(
      'INSERT INTO sale_items (sale_id, product_id, quantity, unit_price, total) VALUES (?, ?, ?, ?, ?)',
      [saleId, item.product_id, item.quantity, unit_price, itemTotal]
    );
    
    await db.run('UPDATE products SET current_stock = current_stock - ? WHERE id = ?', [item.quantity, item.product_id]);
    await db.run(
      'INSERT INTO warehouse_transactions (product_id, transaction_type, quantity, reference_id, notes) VALUES (?, ?, ?, ?, ?)',
      [item.product_id, 'sale_out', item.quantity, saleId, `ሽያጭ ${invoice_number}`]
    );
  }
  
  if (customer_id && remaining > 0) {
    await db.run('UPDATE customers SET current_credit = current_credit + ? WHERE id = ?', [remaining, customer_id]);
  }
  
  const newSale = await db.get('SELECT * FROM sales WHERE id = ?', saleId);
  res.status(201).json(newSale);
});

// Update payment
router.put('/:id/payment', authenticate, async (req, res) => {
  const { amount } = req.body;
  const db = getDb();
  
  const sale = await db.get('SELECT * FROM sales WHERE id = ?', req.params.id);
  if (!sale) return res.status(404).json({ error: 'ሽያጭ አልተገኘም' });
  
  const newPaid = sale.amount_paid + amount;
  const newRemaining = sale.total - newPaid;
  const payment_status = newRemaining <= 0 ? 'paid' : (newPaid > 0 ? 'partial' : 'unpaid');
  
  await db.run(
    'UPDATE sales SET amount_paid = ?, remaining = ?, payment_status = ? WHERE id = ?',
    [newPaid, newRemaining, payment_status, req.params.id]
  );
  
  if (sale.customer_id) {
    await db.run('UPDATE customers SET current_credit = current_credit - ? WHERE id = ?', [amount, sale.customer_id]);
  }
  
  res.json({ success: true });
});

// Delete sale
router.delete('/:id', authenticate, async (req, res) => {
  const db = getDb();
  const items = await db.all('SELECT * FROM sale_items WHERE sale_id = ?', req.params.id);
  for (const item of items) {
    await db.run('UPDATE products SET current_stock = current_stock + ? WHERE id = ?', [item.quantity, item.product_id]);
  }
  await db.run('DELETE FROM sales WHERE id = ?', req.params.id);
  res.json({ success: true });
});

module.exports = router;
