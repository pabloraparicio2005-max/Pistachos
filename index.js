/**
 * OlivaPistacho — Backend
 * Base de datos (JSON) + Stripe Checkout + pedidos para el admin
 *
 * 1. Copia .env.example a .env y pon tus claves de Stripe
 * 2. npm install
 * 3. npm start
 * 4. Abre la web y configura window.API_URL = 'http://localhost:3001'
 */

require('dotenv').config();
const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const { v4: uuidv4 } = require('uuid');

const app = express();
const PORT = process.env.PORT || 3001;
const DB_PATH = path.join(__dirname, 'data', 'db.json');

// Stripe (opcional: si no hay clave, el endpoint de checkout responde con error claro)
let stripe = null;
if (process.env.STRIPE_SECRET_KEY) {
  stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
}

// ---------- Base de datos JSON ----------
function ensureDb() {
  const dir = path.dirname(DB_PATH);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  if (!fs.existsSync(DB_PATH)) {
    const initial = {
      users: [],
      orders: [],
      movements: [],
      balance: 1000,
      notifications: [],
      reviews: [
        { id: '1', name: 'María G.', stars: 5, text: 'Los pistachos más crujientes que he probado.', date: '2025-09-12' },
        { id: '2', name: 'Carlos R.', stars: 5, text: 'El pack regalo llegó perfecto.', date: '2025-08-28' }
      ]
    };
    fs.writeFileSync(DB_PATH, JSON.stringify(initial, null, 2));
  }
}

function readDb() {
  ensureDb();
  return JSON.parse(fs.readFileSync(DB_PATH, 'utf8'));
}

function writeDb(db) {
  ensureDb();
  fs.writeFileSync(DB_PATH, JSON.stringify(db, null, 2));
}

// Webhook de Stripe necesita el body en bruto
app.post(
  '/api/webhook',
  express.raw({ type: 'application/json' }),
  async (req, res) => {
    if (!stripe || !process.env.STRIPE_WEBHOOK_SECRET) {
      return res.status(400).send('Webhook no configurado');
    }
    const sig = req.headers['stripe-signature'];
    let event;
    try {
      event = stripe.webhooks.constructEvent(req.body, sig, process.env.STRIPE_WEBHOOK_SECRET);
    } catch (err) {
      console.error('Webhook signature error:', err.message);
      return res.status(400).send(`Webhook Error: ${err.message}`);
    }

    if (event.type === 'checkout.session.completed') {
      const session = event.data.object;
      const db = readDb();
      const orderId = session.metadata?.orderId || 'OP-' + Date.now().toString().slice(-8);
      const total = (session.amount_total || 0) / 100;
      const customerName = session.metadata?.customerName || session.customer_details?.name || 'Cliente';
      const customerEmail = session.customer_email || session.customer_details?.email || '';

      // Evitar duplicados
      if (!db.orders.find((o) => o.stripeSessionId === session.id)) {
        const order = {
          id: orderId,
          date: new Date().toISOString(),
          customer: customerName,
          email: customerEmail,
          address: session.metadata?.address || '',
          phone: session.metadata?.phone || '',
          items: JSON.parse(session.metadata?.items || '[]'),
          method: 'stripe',
          total,
          status: 'Pagado',
          stripeSessionId: session.id
        };
        db.orders.unshift(order);
        db.balance = (db.balance || 0) + total;
        db.movements.unshift({
          date: new Date().toISOString(),
          type: 'ingreso',
          concept: `Stripe · Venta ${orderId} · ${customerName}`,
          amount: total,
          balanceAfter: db.balance
        });
        db.notifications.unshift({
          time: new Date().toLocaleString('es-ES'),
          msg: `💰 Stripe +${total.toFixed(2)} € · Pedido ${orderId} de ${customerName}. Saldo: ${db.balance.toFixed(2)} €`
        });
        if (db.notifications.length > 50) db.notifications = db.notifications.slice(0, 50);
        writeDb(db);
        console.log('✅ Pedido confirmado por Stripe:', orderId, total + '€');
      }
    }

    res.json({ received: true });
  }
);

app.use(cors({ origin: true }));
app.use(express.json());

// Health
app.get('/api/health', (req, res) => {
  res.json({
    ok: true,
    stripe: !!stripe,
    mode: process.env.STRIPE_SECRET_KEY?.startsWith('sk_live') ? 'live' : 'test'
  });
});

// ---------- Auth (clientes) ----------
const ADMIN_USER = process.env.ADMIN_USER || 'admin';
const ADMIN_PASS = process.env.ADMIN_PASS || 'admin123';

app.post('/api/register', (req, res) => {
  const { name, email, password } = req.body;
  if (!name || !email || !password || password.length < 6) {
    return res.status(400).json({ error: 'Datos inválidos (mín. 6 caracteres en contraseña)' });
  }
  const em = String(email).trim().toLowerCase();
  if (em === ADMIN_USER) return res.status(400).json({ error: 'Ese usuario no está disponible' });

  const db = readDb();
  if (db.users.some((u) => u.email === em)) {
    return res.status(400).json({ error: 'Ya existe una cuenta con ese correo' });
  }
  const user = { id: uuidv4(), name, email: em, password, role: 'cliente' };
  db.users.push(user);
  writeDb(db);
  res.json({ email: user.email, name: user.name, role: 'cliente' });
});

app.post('/api/login', (req, res) => {
  const email = String(req.body.email || '').trim().toLowerCase();
  const password = req.body.password || '';

  if (email === ADMIN_USER && password === ADMIN_PASS) {
    return res.json({ email: ADMIN_USER, name: 'Administrador', role: 'admin' });
  }

  const db = readDb();
  const found = db.users.find((u) => u.email === email && u.password === password);
  if (!found) return res.status(401).json({ error: 'Correo o contraseña incorrectos' });
  res.json({ email: found.email, name: found.name, role: 'cliente' });
});

// ---------- Pedidos (simulado sin Stripe, o tras webhook) ----------
app.get('/api/orders', (req, res) => {
  // En producción: proteger con token de admin
  const db = readDb();
  res.json(db.orders);
});

app.post('/api/orders', (req, res) => {
  // Pedido simulado (sin Stripe) o backup
  const { customer, email, address, phone, items, method, total } = req.body;
  if (!customer || !email || !items || !total) {
    return res.status(400).json({ error: 'Faltan datos del pedido' });
  }
  const db = readDb();
  const orderId = 'OP-' + Date.now().toString().slice(-8);
  const order = {
    id: orderId,
    date: new Date().toISOString(),
    customer,
    email,
    address: address || '',
    phone: phone || '',
    items,
    method: method || 'simulado',
    total: Number(total),
    status: 'Pagado'
  };
  db.orders.unshift(order);
  db.balance = (db.balance || 0) + Number(total);
  db.movements.unshift({
    date: new Date().toISOString(),
    type: 'ingreso',
    concept: `Venta ${orderId} · ${customer} · ${(method || 'simulado').toUpperCase()}`,
    amount: Number(total),
    balanceAfter: db.balance
  });
  db.notifications.unshift({
    time: new Date().toLocaleString('es-ES'),
    msg: `💰 +${Number(total).toFixed(2)} € · Pedido ${orderId} de ${customer}. Saldo: ${db.balance.toFixed(2)} €`
  });
  writeDb(db);
  res.json({ order, balance: db.balance });
});

// ---------- Cuenta admin ----------
app.get('/api/account', (req, res) => {
  const db = readDb();
  res.json({
    balance: db.balance || 0,
    movements: db.movements || [],
    notifications: db.notifications || [],
    ordersCount: (db.orders || []).length
  });
});

app.post('/api/expenses', (req, res) => {
  const { concept, amount } = req.body;
  const amt = Number(amount);
  if (!concept || !amt || amt <= 0) return res.status(400).json({ error: 'Concepto e importe válidos requeridos' });
  const db = readDb();
  if (amt > (db.balance || 0)) return res.status(400).json({ error: 'Saldo insuficiente' });
  db.balance -= amt;
  db.movements.unshift({
    date: new Date().toISOString(),
    type: 'gasto',
    concept,
    amount: amt,
    balanceAfter: db.balance
  });
  db.notifications.unshift({
    time: new Date().toLocaleString('es-ES'),
    msg: `📉 −${amt.toFixed(2)} € · ${concept}. Saldo: ${db.balance.toFixed(2)} €`
  });
  writeDb(db);
  res.json({ balance: db.balance });
});

// ---------- Stripe Checkout ----------
app.post('/api/create-checkout-session', async (req, res) => {
  if (!stripe) {
    return res.status(503).json({
      error: 'Stripe no configurado. Añade STRIPE_SECRET_KEY en el archivo .env del servidor.'
    });
  }

  const { items, customerEmail, customerName, address, phone } = req.body;
  if (!items || !items.length || !customerEmail) {
    return res.status(400).json({ error: 'items y customerEmail son obligatorios' });
  }

  const orderId = 'OP-' + Date.now().toString().slice(-8);
  const origin = req.headers.origin || process.env.FRONTEND_URL || 'http://localhost:5500';

  try {
    const session = await stripe.checkout.sessions.create({
      mode: 'payment',
      customer_email: customerEmail,
      line_items: items.map((i) => ({
        price_data: {
          currency: 'eur',
          product_data: { name: i.name },
          unit_amount: Math.round(Number(i.price) * 100)
        },
        quantity: Number(i.quantity) || 1
      })),
      success_url: `${origin}?pago=ok&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${origin}?pago=cancelado`,
      metadata: {
        orderId,
        customerName: customerName || '',
        address: address || '',
        phone: phone || '',
        items: JSON.stringify(
          items.map((i) => ({ name: i.name, qty: i.quantity, price: i.price }))
        )
      }
    });

    // Pedido pendiente hasta que el webhook confirme
    const db = readDb();
    db.orders.unshift({
      id: orderId,
      date: new Date().toISOString(),
      customer: customerName || customerEmail,
      email: customerEmail,
      address: address || '',
      phone: phone || '',
      items: items.map((i) => ({ name: i.name, qty: i.quantity, price: i.price })),
      method: 'stripe',
      total: items.reduce((s, i) => s + Number(i.price) * (Number(i.quantity) || 1), 0),
      status: 'Pendiente de pago',
      stripeSessionId: session.id
    });
    writeDb(db);

    res.json({ url: session.url, orderId, sessionId: session.id });
  } catch (err) {
    console.error('Stripe error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// Confirmar sesión (por si no usas webhook en local)
app.get('/api/checkout-session/:id', async (req, res) => {
  if (!stripe) return res.status(503).json({ error: 'Stripe no configurado' });
  try {
    const session = await stripe.checkout.sessions.retrieve(req.params.id);
    if (session.payment_status === 'paid') {
      const db = readDb();
      const order = db.orders.find((o) => o.stripeSessionId === session.id);
      if (order && order.status !== 'Pagado') {
        order.status = 'Pagado';
        const total = (session.amount_total || 0) / 100;
        db.balance = (db.balance || 0) + total;
        db.movements.unshift({
          date: new Date().toISOString(),
          type: 'ingreso',
          concept: `Stripe · Venta ${order.id} · ${order.customer}`,
          amount: total,
          balanceAfter: db.balance
        });
        db.notifications.unshift({
          time: new Date().toLocaleString('es-ES'),
          msg: `💰 Stripe +${total.toFixed(2)} € · Pedido ${order.id}. Saldo: ${db.balance.toFixed(2)} €`
        });
        writeDb(db);
      }
    }
    res.json({ payment_status: session.payment_status, status: session.status });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Reviews
app.get('/api/reviews', (req, res) => {
  res.json(readDb().reviews || []);
});

app.post('/api/reviews', (req, res) => {
  const { name, stars, text } = req.body;
  if (!text) return res.status(400).json({ error: 'Comentario vacío' });
  const db = readDb();
  const review = {
    id: uuidv4(),
    name: name || 'Anónimo',
    stars: Number(stars) || 5,
    text,
    date: new Date().toISOString().slice(0, 10)
  };
  db.reviews.unshift(review);
  writeDb(db);
  res.json(review);
});

app.listen(PORT, () => {
  ensureDb();
  console.log('');
  console.log('  OlivaPistacho API');
  console.log('  ------------------');
  console.log(`  http://localhost:${PORT}`);
  console.log(`  Stripe: ${stripe ? 'CONFIGURADO' : 'NO (pon STRIPE_SECRET_KEY en .env)'}`);
  console.log(`  Admin: ${ADMIN_USER} / ${ADMIN_PASS}`);
  console.log('  Base de datos: server/data/db.json');
  console.log('');
});
