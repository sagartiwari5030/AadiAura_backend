import express from 'express'
import cors from 'cors'
import { cfg } from './config.js'
import webhook from './routes/webhook.js'
import orders from './routes/orders.js'
import admin from './routes/admin.js'
const app = express()
app.use(cors({ origin: cfg.origins }))
app.use('/api/webhooks', webhook)   // must come before express.json(): needs the raw body
app.use(express.json())
app.get('/health', (_, res) => res.json({ ok: true }))
app.use('/api/admin', admin)
app.use('/api', orders)
if (!cfg.apiUrl.startsWith('https://')) console.warn('API_URL is not a public https address, so Cashfree webhooks are skipped. Set API_URL on Render.')
if (!cfg.origins.every(o => /^https?:\/\/[^\s#]+$/.test(o))) console.warn('SITE_URL looks wrong:', cfg.origins)
app.listen(cfg.port, () => console.log('API on ' + cfg.port))
