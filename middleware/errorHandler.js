function errorHandler(err, req, res, next) {
  console.error('ስህተት:', err);
  
  if (err.code === 'SQLITE_CONSTRAINT') {
    return res.status(400).json({ error: 'ይህ መረጃ ቀድሞ አለ' });
  }
  
  res.status(500).json({ error: err.message || 'የሰርቨር ስህተት' });
}

module.exports = errorHandler;
