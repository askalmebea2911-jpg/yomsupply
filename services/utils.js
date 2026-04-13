// Format currency
function formatCurrency(amount) {
  return new Intl.NumberFormat('et-ET', { style: 'currency', currency: 'ETB' }).format(amount);
}

// Format date
function formatDate(date) {
  return new Date(date).toLocaleDateString('et-ET');
}

// Generate random ID
function generateId(prefix = '') {
  return prefix + Date.now() + '-' + Math.random().toString(36).substr(2, 6);
}

module.exports = { formatCurrency, formatDate, generateId };
