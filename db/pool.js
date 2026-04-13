const sqlite3 = require('sqlite3');
const { open } = require('sqlite');
const path = require('path');
const fs = require('fs');

let db;

async function initDatabase() {
  const dbPath = path.join(__dirname, '..', 'yom_sales.db');
  
  // Reset database if RESET_DB is true
  if (process.env.RESET_DB === 'true') {
    console.log('Resetting database...');
    if (fs.existsSync(dbPath)) {
      fs.unlinkSync(dbPath);
      console.log('Old database deleted');
    }
  }
  
  db = await open({
    filename: dbPath,
    driver: sqlite3.Database
  });

  // Read and execute schema
  const schemaPath = path.join(__dirname, 'schema.sql');
  const schema = fs.readFileSync(schemaPath, 'utf8');
  await db.exec(schema);
  
  console.log('Database tables created');
  
  // Create default admin user
  const admin = await db.get("SELECT * FROM users WHERE username = 'admin'");
  if (!admin) {
    const bcrypt = require('bcryptjs');
    const hashedPassword = await bcrypt.hash('admin123', 10);
    await db.run(
      "INSERT INTO users (username, password, full_name, role, is_active) VALUES (?, ?, ?, ?, ?)",
      ['admin', hashedPassword, 'አስተዳዳሪ', 'admin', 1]
    );
    console.log('Admin user created: admin / admin123');
  }
  
  // Check if employees table has data
  const empCount = await db.get('SELECT COUNT(*) as count FROM employees');
  console.log('Employees count:', empCount.count);
  
  return db;
}

function getDb() {
  if (!db) throw new Error('Database not initialized');
  return db;
}

module.exports = { initDatabase, getDb };
