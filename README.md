# OlivaPistacho — Backend (base de datos + Stripe)

## Instalación (en tu PC)

```bash
cd server
cp .env.example .env
# Edita .env y pon tu STRIPE_SECRET_KEY (modo test: sk_test_...)
npm install
npm start
```

API en: **http://localhost:3001**

## Stripe (pagos reales en test)

1. Cuenta en https://dashboard.stripe.com
2. Developers → API keys → copia `sk_test_...` a `.env`
3. (Opcional local) Instala Stripe CLI y ejecuta:
   ```bash
   stripe listen --forward-to localhost:3001/api/webhook
   ```
   Copia el `whsec_...` a `.env`

4. En la web, al pagar con el método "Stripe / Tarjeta", el cliente va a la página de Stripe.
5. Tarjeta de prueba: `4242 4242 4242 4242` · fecha futura · CVC cualquiera

## Base de datos

Archivo: `server/data/db.json`

Contiene: users, orders, movements, balance, notifications, reviews.

Los pedidos llegan ahí y el panel Admin de la web los lee desde la API.

## Endpoints

| Método | Ruta | Descripción |
|--------|------|-------------|
| GET | /api/health | Estado del servidor y Stripe |
| POST | /api/register | Registro cliente |
| POST | /api/login | Login |
| POST | /api/create-checkout-session | Crear pago Stripe |
| GET | /api/checkout-session/:id | Confirmar pago |
| GET | /api/orders | Lista de pedidos (admin) |
| POST | /api/orders | Pedido simulado (sin Stripe) |
| GET | /api/account | Saldo, movimientos, notifs |
| POST | /api/expenses | Restar gasto de materiales |
