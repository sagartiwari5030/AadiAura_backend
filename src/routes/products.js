import { Router } from 'express'
import crypto from 'crypto'
import { sb, CATEGORIES, BUCKET } from '../config.js'
import { bad, h } from '../middleware.js'

const r = Router() // mounted inside admin.js, so auth + admin checks already ran
const pathOf = url => { const i = String(url).indexOf(`/${BUCKET}/`); return i < 0 ? null : decodeURIComponent(String(url).slice(i + BUCKET.length + 2).split('?')[0]) }
const dropFiles = urls => { const p = urls.map(pathOf).filter(Boolean); return p.length ? sb.storage.from(BUCKET).remove(p) : null }

function clean(b) {
  const o = {}
  if (b.name !== undefined) { const n = String(b.name).trim(); if (!n) throw bad('Name is required'); o.name = n }
  if (b.description !== undefined) o.description = String(b.description)
  if (b.category !== undefined) { if (!CATEGORIES.includes(b.category)) throw bad('Choose a valid category'); o.category = b.category }
  if (b.price !== undefined) { const v = Number(b.price); if (!(v >= 0)) throw bad('Price must be 0 or more'); o.price = v }
  if (b.compare_price !== undefined) {
    o.compare_price = b.compare_price === null || b.compare_price === '' ? null : Number(b.compare_price)
    if (o.compare_price !== null && !(o.compare_price >= 0)) throw bad('MRP must be a number')
  }
  if (b.stock !== undefined) { const v = Number(b.stock); if (!Number.isInteger(v) || v < 0) throw bad('Stock must be a whole number, 0 or more'); o.stock = v }
  if (b.active !== undefined) o.active = !!b.active
  if (b.images !== undefined) {
    if (!Array.isArray(b.images) || b.images.some(u => !pathOf(u))) throw bad('Invalid images')
    o.images = b.images
  }
  return o
}

// Browser uploads straight to storage with a one-time signed URL created here (no storage rules needed for admins)
r.post('/upload-url', h(async (req, res) => {
  const name = String(req.body.filename || 'photo.webp').replace(/[^a-zA-Z0-9.]/g, '_').slice(-60)
  const path = `${crypto.randomUUID()}-${name}`
  const { data, error } = await sb.storage.from(BUCKET).createSignedUploadUrl(path)
  if (error) throw bad(error.message)
  res.json({ path, token: data.token, publicUrl: sb.storage.from(BUCKET).getPublicUrl(path).data.publicUrl })
}))

r.post('/products', h(async (req, res) => {
  const o = clean(req.body)
  if (!o.name || o.price === undefined || !o.category) throw bad('Name, price and category are required')
  const slug = o.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') + '-' + Math.random().toString(36).slice(2, 6)
  const { data, error } = await sb.from('products').insert({ stock: 0, images: [], ...o, slug }).select().single()
  if (error) throw bad(error.message)
  res.json(data)
}))

r.patch('/products/:id', h(async (req, res) => {
  const { data: old } = await sb.from('products').select('images').eq('id', req.params.id).single()
  if (!old) throw bad('Product not found', 404)
  const o = clean(req.body)
  if (!Object.keys(o).length) throw bad('Nothing to change')
  const { data, error } = await sb.from('products').update(o).eq('id', req.params.id).select().single()
  if (error) throw bad(error.message)
  if (o.images) await dropFiles((old.images || []).filter(u => !o.images.includes(u)))  // removed photos are deleted from storage
  res.json(data)
}))

r.delete('/products/:id', h(async (req, res) => {
  const { data: old } = await sb.from('products').select('images').eq('id', req.params.id).single()
  if (!old) throw bad('Product not found', 404)
  const { error } = await sb.from('products').delete().eq('id', req.params.id)
  if (error) throw bad(error.message)
  await dropFiles(old.images || [])
  res.json({ ok: true })
}))
export default r
