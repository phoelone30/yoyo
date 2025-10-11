const express = require("express");
const dotenv = require("dotenv");
const fetch = require("node-fetch");
const multer = require("multer");
const fs = require("fs");
const path = require("path");
const FormData = require("form-data");
const cors = require("cors");

dotenv.config();
const app = express();

const PORT = process.env.PORT || 4000;
const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN || '';
const TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID || '';
const ADMIN_KEY = process.env.ADMIN_KEY || '215355';

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

const uploadsDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir);

const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, uploadsDir);
  },
  filename: function (req, file, cb) {
    const unique = Date.now() + '-' + Math.round(Math.random() * 1e6);
    cb(null, unique + path.extname(file.originalname));
  }
});
const upload = multer({ storage });

// Orders.json file
const ORDERS_FILE = path.join(__dirname, 'orders.json');
function readOrders() {
  try {
    return JSON.parse(fs.readFileSync(ORDERS_FILE));
  } catch (e) { return []; }
}
function writeOrders(arr) {
  fs.writeFileSync(ORDERS_FILE, JSON.stringify(arr, null, 2));
}


//555 ✅ Telegram send function
async function sendToTelegram(order, filePath = null) {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_CHAT_ID;

  const caption = `
🧾 *New Order*
-------------------------
🆔 Order ID: ${order.id}
👤 Player ID: ${order.playerId}
🎮 Provider: ${order.provider}
💎 UC: ${order.amountUc}
💰 Amount: ${order.amountK} Ks
📄 Slip: ${order.slip || 'N/A'}
📌 Status: ${order.status}
🕒 Created: ${order.createdAt}
${order.paidAt ? "✅ Paid At: " + order.paidAt : ""}
`;

  if (filePath) {
    // ✅ Send photo with caption
    const formData = new FormData();
    formData.append("chat_id", chatId);
    formData.append("caption", caption);
    formData.append("parse_mode", "Markdown");
    formData.append("photo", fs.createReadStream(filePath));

    await fetch(`https://api.telegram.org/bot${token}/sendPhoto`, {
      method: "POST",
      body: formData,
    });
  } else {
    // ✅ Fallback: text only
    await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: chatId,
        text: caption,
        parse_mode: "Markdown"
      }),
    });
  }
}



//555 ✅ Order create
app.post('/order', upload.single('slip'), async (req, res) => {
  const { playerId, amountUc, amountK = 0, provider = 'PUBG' } = req.body;

  if (!playerId || !amountUc) {
    return res.status(400).json({ error: 'playerId and amountUc required' });
  }

  const file = req.file ? req.file.filename : null;
  const orders = readOrders();
  const id = 'ORD' + Date.now();
  const order = {
    id,
    playerId,
    amountUc: Number(amountUc),
    amountK: Number(amountK),
    provider,
    slip: file,
    status: 'PENDING',
    createdAt: new Date().toISOString()
  };

  orders.unshift(order);
  writeOrders(orders);

  //555 ✅ send to Telegram
  const filePath = file ? path.join(uploadsDir, file) : null;
  await sendToTelegram(order, filePath);

  res.json({ ok: true, order });
});



// Admin: list orders
app.get('/admin/orders', (req, res) => {
  const key = req.headers['x-admin-key'] || '';
  if (key !== ADMIN_KEY) return res.status(401).json({ error: 'unauthorized' });
  const orders = readOrders();
  res.json({ orders });
});

// Admin: mark paid
app.post('/admin/mark-paid', (req, res) => {
  const key = req.headers['x-admin-key'] || '';
  if (key !== ADMIN_KEY) return res.status(401).json({ error: 'unauthorized' });
  const { id } = req.body;
  if (!id) return res.status(400).json({ error: 'id required' });
  const orders = readOrders();
  const idx = orders.findIndex(o => o.id === id);
  if (idx === -1) return res.status(404).json({ error: 'order not found' });
  orders[idx].status = 'PAID';
  orders[idx].paidAt = new Date().toISOString();
  writeOrders(orders);
  res.json({ ok: true, order: orders[idx] });
});

// Serve uploaded images
app.get('/uploads/:file', (req, res) => {
  const f = path.join(uploadsDir, req.params.file);
  if (fs.existsSync(f)) res.sendFile(f);
  else res.status(404).send('Not found');
});

app.listen(PORT, () => console.log('Server running on port', PORT));
