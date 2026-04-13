const express = require('express');
const { getDb } = require('../db/pool');
const { authenticate } = require('../middleware/auth');

const router = express.Router();

// Sales report by date range
router.get('/sales', authenticate, async (req, res) => {
  const { start_date, end_date } = req.query;
  const db = getDb();
  
  let query = `
    SELECT DATE(s.sale_date) as date, 
           COUNT(*) as count, 
           COALESCE(SUM(s.total), 0) as total,
           COALESCE(SUM(s.amount_paid), 0) as paid
    FROM sales s
    WHERE 1=1
  `;
  const params = [];
  
  if (start_date) {
    query += ' AND DATE(s.sale_date) >= ?';
    params.push(start_date);
  }
  if (end_date) {
    query += ' AND DATE(s.sale_date) <= ?';
    params.push(end_date);
  }
  
  query += ' GROUP BY DATE(s.sale_date) ORDER BY date DESC';
  
  const report = await db.all(query, params);
  res.json(report);
});

// Product sales report
router.get('/products', authenticate, async (req, res) => {
  const { start_date, end_date } = req.query;
  const db = getDb();
  
  let query = `
    SELECT p.id, p.name, p.code,
           COALESCE(SUM(si.quantity), 0) as quantity_sold,
           COALESCE(SUM(si.total), 0) as total_amount
    FROM products p
    LEFT JOIN sale_items si ON p.id = si.product_id
    LEFT JOIN sales s ON si.sale_id = s.id
    WHERE 1=1
  `;
  const params = [];
  
  if (start_date) {
    query += ' AND DATE(s.sale_date) >= ?';
    params.push(start_date);
  }
  if (end_date) {
    query += ' AND DATE(s.sale_date) <= ?';
    params.push(end_date);
  }
  
  query += ' GROUP BY p.id ORDER BY quantity_sold DESC';
  
  const report = await db.all(query, params);
  res.json(report);
});

// Expenses report
router.get('/expenses', authenticate, async (req, res) => {
  const { start_date, end_date, category } = req.query;
  const db = getDb();
  
  let query = `
    SELECT e.category, 
           COUNT(*) as count, 
           COALESCE(SUM(e.amount), 0) as total
    FROM expenses e
    WHERE 1=1
  `;
  const params = [];
  
  if (start_date) {
    query += ' AND e.expense_date >= ?';
    params.push(start_date);
  }
  if (end_date) {
    query += ' AND e.expense_date <= ?';
    params.push(end_date);
  }
  if (category && category !== 'all') {
    query += ' AND e.category = ?';
    params.push(category);
  }
  
  query += ' GROUP BY e.category ORDER BY total DESC';
  
  const report = await db.all(query, params);
  res.json(report);
});

// Customer report
router.get('/customers', authenticate, async (req, res) => {
  const db = getDb();
  
  const report = await db.all(`
    SELECT c.id, c.name, c.phone,
           COUNT(s.id) as purchase_count,
           COALESCE(SUM(s.total), 0) as total_purchases,
           c.current_credit
    FROM customers c
    LEFT JOIN sales s ON c.id = s.customer_id
    GROUP BY c.id
    ORDER BY total_purchases DESC
  `);
  
  res.json(report);
});

// Profit report
router.get('/profit', authenticate, async (req, res) => {
  const { start_date, end_date } = req.query;
  const db = getDb();
  
  let query = `
    SELECT SUM(si.quantity * (p.selling_price - p.cost_price)) as gross_profit
    FROM sale_items si
    JOIN products p ON si.product_id = p.id
    JOIN sales s ON si.sale_id = s.id
    WHERE 1=1
  `;
  const params = [];
  
  if (start_date) {
    query += ' AND DATE(s.sale_date) >= ?';
    params.push(start_date);
  }
  if (end_date) {
    query += ' AND DATE(s.sale_date) <= ?';
    params.push(end_date);
  }
  
  const profit = await db.get(query, params);
  
  // Get expenses
  let expQuery = 'SELECT COALESCE(SUM(amount), 0) as total_expenses FROM expenses WHERE 1=1';
  if (start_date) {
    expQuery += ' AND expense_date >= ?';
  }
  if (end_date) {
    expQuery += ' AND expense_date <= ?';
  }
  const expenses = await db.get(expQuery, params);
  
  res.json({
    gross_profit: profit.gross_profit || 0,
    total_expenses: expenses.total_expenses || 0,
    net_profit: (profit.gross_profit || 0) - (expenses.total_expenses || 0)
  });
});

module.exports = router;
