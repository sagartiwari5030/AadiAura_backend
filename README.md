# Aadi Aura Habitat: backend
Express API (payments, orders, admin data). No UI code lives here. Frontend is the separate `aadiaura-frontend` project.

## Setup
1. Supabase SQL Editor: run `supabase/schema.sql`, then `supabase/migration-2.sql`.
2. `cp .env.example .env` and fill values (needs Node 20.6 or newer).
3. `npm install` then `npm run dev` (http://localhost:3000, check /health).

## Structure
- `src/index.js` app wiring · `src/config.js` env and Supabase client
- `src/middleware.js` auth and admin checks · `src/cashfree.js` all Cashfree calls
- `src/routes/` webhook, orders (customer), admin

## Deploy on Render (Web Service)
Build `npm install`, start `npm start`, set the env vars from `.env.example` (SITE_URL = frontend URL, API_URL = this service URL).
Going live: CASHFREE_ENV=production with live keys. Webhook URL: `https://YOUR-API/api/webhooks/cashfree`.
