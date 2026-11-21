import { Router } from 'express'
import { sb } from '../config.js'
import { auth, bad, h, myOrder } from '../middleware.js'
import { getSession, refund, syncPayment } from '../cashfree.js'
const r = Router()
r.use(auth)
r.post('/checkout', h(async (req, res) => {
  const { items, address, method } = req.body
  if (!['online', 'cod'].includes(method) || !Array.isArray(items) || !items.length) throw bad('Invalid order')
  const { data: id, error } = await sb.rpc('create_order_for', { p_user: req.user.id, items: items.map(i => ({ id: i.id, qty: i.qty })), address, pay: method })
  if (error) throw bad(error.message)
  const order = (await sb.from('orders').select('*').eq('id', id).single()).data
  res.json({ orderId: id, sessionId: method === 'online' ? await getSession(order, req.user.email) : null })
}))
r.post('/orders/:id/pay', h(async (req, res) => {
  const o = await myOrder(req)
  if (o.payment_method !== 'online' || o.payment_status === 'paid' || o.status === 'cancelled') throw bad('This order cannot be paid online')
  res.json({ sessionId: await getSession(o, req.user.email) })
}))
r.post('/orders/:id/verify', h(async (req, res) => {
  const o = await myOrder(req)
  const cfStatus = o.payment_method === 'online' ? await syncPayment(o.id) : null
  res.json({ cfStatus, order: (await sb.from('orders').select('*').eq('id', o.id).single()).data })
}))
r.post('/orders/:id/cancel', h(async (req, res) => {
  const o = await myOrder(req)
  if (!['placed', 'confirmed'].includes(o.status)) throw bad('This order has already shipped, please contact us')
  if (o.payment_status === 'paid') await refund(o)
  await sb.from('orders').update({ status: 'cancelled' }).eq('id', o.id)
  res.json({ ok: true })
}))
export default r
