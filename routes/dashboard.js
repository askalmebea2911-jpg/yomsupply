const express = require('express');
const { getDb } = require('../db/pool');
const { authenticate } = require('../middleware/auth');

const router = express.Router();

router.get('/', authenticate, async (req, res) => {
  const db = getDb();
  
  // Today's sales
  const today = new Date().toISOString().split('T')[0];
  const todaySales = await db.get(
    "SELECT COALESCE(SUM(total), 0) as total FROM sales WHERE DATE(sale_date) = ? AND payment_status != 'cancelled'",
    today
  );
  
  // This month sales
  const monthStart = new Date().getFullYear() + '-' + String(new Date().getMonth() + 1).padStart(2, '0') + '-01';
  const monthSales = await db.get(
    "SELECT COALESCE(SUM(total), 0) as total FROM sales WHERE sale_date >= ? AND payment_status != 'cancelled'",
    monthStart
  );
  
  // Total customers
  const totalCustomers = await db.get('SELECT COUNT(*) as count FROM customers');
  
  // Total products
  const totalProducts = await db.get('SELECT COUNT(*) as count FROM products WHERE is_active = 1');
  
  // Low stock products
  const lowStock = await db.get('SELECT COUNT(*) as count FROM products WHERE current_stock <= min_stock AND is_active = 1');
  
  // Today's expenses
  const todayExpenses = await db.get(
    "SELECT COALESCE(SUM(amount), 0) as total FROM expenses WHERE expense_date = ?",
    today
  );
  
  // Recent sales
  const recentSales = await db.all(`
    SELECT s.id, s.invoice_number, s.total, s.sale_date, c.name as customer_name
    FROM sales s
    LEFT JOIN customers c ON s.customer_id = c.id
    ORDER BY s.sale_date DESC
    LIMIT 10
  `);
  
  // Pending preorders
  const pendingPreorders = await db.get(
    "SELECT COUNT(*) as count FROM preorders WHERE status = 'pending'"
  );
  
  res.json({
    todaySales: todaySales.total,
    monthSales: monthSales.total,
    totalCustomers: totalCustomers.count,
    totalProducts: totalProducts.count,
    lowStockCount: lowStock.count,
    todayExpenses: todayExpenses.total,
    recentSales,
    pendingPreorders: pendingPreorders.count
  });
});

module.exports = router;
