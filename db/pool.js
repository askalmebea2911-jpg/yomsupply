const sqlite3 = require('sqlite3');
const { open } = require('sqlite');
const path = require('path');
const fs = require('fs');

let db;

async function initDatabase() {
  // Use persistent disk if available, otherwise local
  let dbPath;
  if (fs.existsSync('/data')) {
    dbPath = path.join('/data', 'yom_sales.db');
    console.log('Using persistent disk at /data');
  } else {
    dbPath = path.join(__dirname, '..', 'yom_sales.db');
    console.log('Using local database');
  }
  
  console.log('Database path:', dbPath);
  
  db = await open({
    filename: dbPath,
    driver: sqlite3.Database
  });

  // Create tables
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
  
  return db;
}

function getDb() {
  if (!db) throw new Error('Database not initialized');
  return db;
}

module.exports = { initDatabase, getDb };
