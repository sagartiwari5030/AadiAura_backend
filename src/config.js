import { createClient } from '@supabase/supabase-js'
const e = process.env
export const cfg = {
  port: e.PORT || 3000, apiUrl: (e.API_URL || '').replace(/\/$/, ''),
  origins: (e.SITE_URL || '').split(',').map(x => x.trim().replace(/\/$/, '')).filter(Boolean), // allow several, e.g. with and without www
  get siteUrl() { return this.origins[0] },
  cfAppId: e.CASHFREE_APP_ID, cfSecret: e.CASHFREE_SECRET_KEY,
  cfBase: e.CASHFREE_ENV === 'production' ? 'https://api.cashfree.com/pg' : 'https://sandbox.cashfree.com/pg'
}
export const sb = createClient(e.SUPABASE_URL, e.SUPABASE_SERVICE_KEY, { auth: { persistSession: false } })
export const STATUSES = ['placed', 'confirmed', 'shipped', 'delivered', 'cancelled']
export const CATEGORIES = ['Mats', 'Sofa', 'Runners', 'Kids', 'Rugs']
export const BUCKET = 'product-images'
