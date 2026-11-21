import { sb } from './config.js'
export const bad = (m, status = 400) => Object.assign(new Error(m), { status })
export const h = fn => (req, res) => fn(req, res).catch(e => res.status(e.status || 500).json({ error: e.message || 'Server error' }))
export const auth = async (req, res, next) => {
  const { data, error } = await sb.auth.getUser((req.headers.authorization || '').replace('Bearer ', ''))
  if (error || !data.user) return res.status(401).json({ error: 'Please sign in' })
  req.user = data.user
  req.isAdmin = (await sb.from('profiles').select('role').eq('id', data.user.id).single()).data?.role === 'admin'
  next()
}
export const admin = (req, res, next) => req.isAdmin ? next() : res.status(403).json({ error: 'Admins only' })
export async function myOrder(req) {
  const { data } = await sb.from('orders').select('*').eq('id', req.params.id).single()
  if (!data || (data.user_id !== req.user.id && !req.isAdmin)) throw bad('Order not found', 404)
  return data
}
