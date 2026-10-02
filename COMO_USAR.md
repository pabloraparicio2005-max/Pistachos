# OlivaPistacho — Cómo usar base de datos + Stripe

## Estructura

```
olivapistacho/
  index.html          ← Tu web
  server/
    index.js          ← Backend (API + Stripe + base de datos)
    package.json
    .env.example      ← Copia a .env
    data/db.json      ← Se crea solo (base de datos)
    README.md
```

## Paso 1 — Arrancar el servidor (obligatorio para BD y Stripe)

En tu ordenador (Terminal / PowerShell):

```bash
cd ruta/a/olivapistacho/server
cp .env.example .env
npm install
npm start
```

Debe salir: `http://localhost:3001` y si tienes clave Stripe: `Stripe: CONFIGURADO`.

## Paso 2 — Clave de Stripe (pagos)

1. https://dashboard.stripe.com → registrarte
2. Developers → API keys → copiar **Secret key** de test (`sk_test_...`)
3. Pegarla en `server/.env`:

```
STRIPE_SECRET_KEY=sk_test_xxxxxxxx
```

4. Reinicia el servidor (`Ctrl+C` y `npm start`)

## Paso 3 — Abrir la web

Abre `index.html` (Live Server de VS Code, o doble clic).

La web intenta conectar a `http://localhost:3001`.

- **Método "Stripe"** → te lleva a pagar de verdad (test) y el pedido queda en `data/db.json`
- **Otros métodos** → pedido simulado, también se guarda en el servidor si está online

Tarjeta de prueba Stripe: `4242 4242 4242 4242` · cualquier fecha futura · CVC 123

## Paso 4 — Ver los pedidos (tú = admin)

Login: usuario `admin` · contraseña `admin123`

Pestaña **Admin**:
- Saldo de la cuenta
- Movimientos
- Tabla de pedidos (viene de la base de datos del servidor)
- Notificaciones

## Sin servidor

Si no arrancas `npm start`, la web sigue funcionando en **modo local** (localStorage), como antes. Stripe no estará disponible.

## Producción (resumen)

1. Sube el backend a Railway / Render / un VPS
2. Pon `STRIPE_SECRET_KEY` en variables de entorno (clave **live**)
3. Configura webhook de Stripe → `https://tu-api.com/api/webhook`
4. En `index.html` cambia `API_URL` a la URL de tu API
5. Sirve el HTML en Netlify/Vercel o el mismo servidor
