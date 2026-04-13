const { getDb } = require('../db/pool');

async function authenticate(req, res, next) {
  if (!req.session.userId) {
    return res.status(401).json({ error: 'እባክዎ ይግቡ' });
  }
  
  const db = getDb();
  const user = await db.get('SELECT * FROM users WHERE id = ? AND is_active = 1', req.session.userId);
  
  if (!user) {
    req.session.destroy();
    return res.status(401).json({ error: 'ተጠቃሚ አልተገኘም' });
  }
  
  req.user = user;
  next();
}

function authorize(...roles) {
  return (req, res, next) => {
    if (!roles.includes(req.user.role)) {
      return res.status(403).json({ error: 'እርምጃው አይፈቀድም' });
    }
    next();
  };
}

module.exports = { authenticate, authorize };
