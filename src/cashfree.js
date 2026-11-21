import { cfg, sb } from './config.js'
async function cf(path, method = 'GET', body) {
  const r = await fetch(cfg.cfBase + path, {
    method, body: body ? JSON.stringify(body) : undefined,
    headers: { 'x-client-id': cfg.cfAppId, 'x-client-secret': cfg.cfSecret, 'x-api-version': '2025-01-01', 'Content-Type': 'application/json' }
  })
  const j = await r.json().catch(() => ({}))
  if (!r.ok) throw Object.assign(new Error(j.message || 'Payment gateway error'), { status: 502, cf: r.status })
  return j
}
// Returns a payable session id (reuses an active Cashfree order, creates one otherwise)
export async function getSession(order, email) {
  try {
    const o = await cf('/orders/' + order.id)
    if (o.order_status === 'ACTIVE') return o.payment_session_id
    if (o.order_status === 'PAID') { await syncPayment(order.id); return null }
  } catch (e) { if (e.cf !== 404) throw e }
  const o = await cf('/orders', 'POST', {
    order_id: order.id, order_amount: Number(order.total), order_currency: 'INR',
    customer_details: { customer_id: order.user_id, customer_name: order.address.name, customer_email: email, customer_phone: String(order.address.phone).replace(/\D/g, '').slice(-10) },
    order_meta: { return_url: `${cfg.siteUrl}/payment-return?order_id={order_id}`, notify_url: `${cfg.apiUrl}/api/webhooks/cashfree` }
  })
  return o.payment_session_id
}
// Always ask Cashfree for the truth; never trust the browser or webhook body alone
export async function syncPayment(id) {
  const o = await cf('/orders/' + id)
  if (o.order_status === 'PAID')
    await sb.from('orders').update({ payment_status: 'paid', paid_at: new Date().toISOString(), status: 'confirmed' }).eq('id', id).in('payment_status', ['pending', 'failed']).eq('status', 'placed')
  else if (['EXPIRED', 'TERMINATED'].includes(o.order_status))
    await sb.from('orders').update({ payment_status: 'failed' }).eq('id', id).eq('payment_status', 'pending')
  return o.order_status
}
export async function refund(order) {
  await cf(`/orders/${order.id}/refunds`, 'POST', { refund_amount: Number(order.total), refund_id: `rf_${order.id.slice(0, 8)}_${Date.now()}`, refund_speed: 'STANDARD' })
  await sb.from('orders').update({ payment_status: 'refunded' }).eq('id', order.id)
}
