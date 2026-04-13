const express = require('express');
const axios = require('axios');
const { getDb } = require('../db/pool');
const { authenticate } = require('../middleware/auth');

const router = express.Router();
const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const TELEGRAM_API = `https://api.telegram.org/bot${BOT_TOKEN}`;

// Send message
async function sendTelegramMessage(chatId, text) {
  try {
    await axios.post(`${TELEGRAM_API}/sendMessage`, {
      chat_id: chatId,
      text: text,
      parse_mode: 'HTML'
    });
    return true;
  } catch (error) {
    console.error('Telegram error:', error.message);
    return false;
  }
}

// Send sale notification
router.post('/sale-notify', authenticate, async (req, res) => {
  const { sale_id, invoice_number, customer_name, total, payment_status } = req.body;
  
  const message = `
🆕 <b>አዲስ ሽያጭ</b>
🧾 ተራ ቁጥር: ${invoice_number}
👤 ደንበኛ: ${customer_name || 'የገንዘብ ግዢ'}
💰 ጠቅላላ: ${total} ብር
💳 ክፍያ: ${payment_status === 'paid' ? 'ተከፍሏል' : (payment_status === 'partial' ? 'ከፊል' : 'አልተከፈለም')}
  `;
  
  // You can set a default chat ID in .env or fetch from settings
  const chatId = process.env.TELEGRAM_CHAT_ID;
  if (chatId) {
    await sendTelegramMessage(chatId, message);
  }
  
  res.json({ success: true });
});

// Send low stock alert
router.post('/low-stock', authenticate, async (req, res) => {
  const db = getDb();
  const lowStock = await db.all(`
    SELECT name, code, current_stock, min_stock 
    FROM products 
    WHERE current_stock <= min_stock AND is_active = 1
  `);
  
  if (lowStock.length > 0 && process.env.TELEGRAM_CHAT_ID) {
    let message = '⚠️ <b>ዝቅተኛ ክምችት ማስጠንቀቂያ</b>\n\n';
    for (const product of lowStock) {
      message += `📦 ${product.name}\n   ያለው: ${product.current_stock} | ዝቅተኛ: ${product.min_stock}\n\n`;
    }
    await sendTelegramMessage(process.env.TELEGRAM_CHAT_ID, message);
  }
  
  res.json({ success: true, count: lowStock.length });
});

// Webhook for receiving messages
router.post('/webhook', async (req, res) => {
  const { message } = req.body;
  
  if (message && message.text) {
    const chatId = message.chat.id;
    const text = message.text;
    
    if (text === '/start') {
      await sendTelegramMessage(chatId, '👋 እንኳን ደህና መጡ!\nይህ የዮም ሽያጭ ማኔጅመንት ሲስተም ቦት ነው።');
    } else if (text === '/sales_today') {
      const db = getDb();
      const today = new Date().toISOString().split('T')[0];
      const sales = await db.get(
        "SELECT COALESCE(SUM(total), 0) as total, COUNT(*) as count FROM sales WHERE DATE(sale_date) = ?",
        today
      );
      await sendTelegramMessage(chatId, `📊 የዛሬው ሽያጭ\n🧾 ብዛት: ${sales.count}\n💰 ጠቅላላ: ${sales.total} ብር`);
    } else {
      await sendTelegramMessage(chatId, 'ትእዛዝ አልታወቀም። የሚቻሉ ትእዛዞች: /start, /sales_today');
    }
  }
  
  res.sendStatus(200);
});

module.exports = router;
