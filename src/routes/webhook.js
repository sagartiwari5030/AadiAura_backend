import { Router } from 'express'
import express from 'express'
import crypto from 'crypto'
import { cfg } from '../config.js'
import { syncPayment } from '../cashfree.js'
const r = Router()
r.post('/cashfree', express.raw({ type: '*/*' }), async (req, res) => {
  const raw = req.body.toString('utf8')
  const sig = String(req.headers['x-webhook-signature'] || '')
  const exp = crypto.createHmac('sha256', cfg.cfSecret).update(String(req.headers['x-webhook-timestamp']) + raw).digest('base64')
  if (sig.length !== exp.length || !crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(exp))) return res.sendStatus(400)
  try { const id = JSON.parse(raw)?.data?.order?.order_id; if (id) await syncPayment(id) } catch (e) { console.error(e.message) }
  res.sendStatus(200)
})
export default r
