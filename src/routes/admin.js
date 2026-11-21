import { Router } from 'express'
import { sb, STATUSES } from '../config.js'
import { admin, auth, bad, h, myOrder } from '../middleware.js'
import { refund } from '../cashfree.js'
import products from './products.js'
const r = Router()
r.use(auth, admin)
r.use(products)
r.get('/stats', h(async (_, res) => {
  const [{ data: o }, { count }, { data: low }] = await Promise.all([
    sb.from('orders').select('status,total,payment_status'),
    sb.from('profiles').select('*', { count: 'exact', head: true }).eq('role', 'customer'),
    sb.from('products').select('name,stock').eq('active', true).lte('stock', 5)])
  const byStatus = {}; o.forEach(x => { byStatus[x.status] = (byStatus[x.status] || 0) + 1 })
  res.json({ orders: o.length, customers: count, byStatus, lowStock: low,
    revenue: o.filter(x => x.payment_status === 'paid').reduce((s, x) => s + Number(x.total), 0),
    awaitingPayment: o.filter(x => x.payment_status === 'pending' && x.status !== 'cancelled').length })
}))
r.get('/customers', h(async (_, res) => {
  const [{ data: u }, { data: p }, { data: o }] = await Promise.all([sb.auth.admin.listUsers({ perPage: 200 }), sb.from('profiles').select('id,full_name,phone,role'), sb.from('orders').select('user_id,total,payment_status')])
  res.json(u.users.map(x => { const mine = o.filter(y => y.user_id === x.id); const pr = p.find(y => y.id === x.id) || {}
    return { id: x.id, email: x.email, name: pr.full_name, phone: pr.phone, role: pr.role, joined: x.created_at, orders: mine.length,
      spent: mine.filter(y => y.payment_status === 'paid').reduce((s, y) => s + Number(y.total), 0) } }))
}))
r.patch('/orders/:id', h(async (req, res) => {
  const { status, tracking_note } = req.body
  const o = await myOrder(req); const u = {}
  if (status) {
    if (!STATUSES.includes(status)) throw bad('Unknown status')
    u.status = status
    if (status === 'delivered' && o.payment_method === 'cod' && o.payment_status !== 'paid') { u.payment_status = 'paid'; u.paid_at = new Date().toISOString() }
  }
  if (tracking_note !== undefined) u.tracking_note = tracking_note
  const { error } = await sb.from('orders').update(u).eq('id', o.id)
  if (error) throw bad(error.message)
  res.json({ ok: true })
}))
r.post('/orders/:id/refund', h(async (req, res) => {
  const o = await myOrder(req)
  if (o.payment_method !== 'online' || o.payment_status !== 'paid') throw bad('Only paid online orders can be refunded')
  await refund(o); res.json({ ok: true })
}))
export default r
