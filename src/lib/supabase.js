import { createClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

export const isConfigured = Boolean(url && anonKey)

if (!isConfigured) {
  console.error(
    'Chưa cấu hình Supabase. Hãy copy .env.example thành .env rồi điền VITE_SUPABASE_URL và VITE_SUPABASE_ANON_KEY.'
  )
}

export const supabase = createClient(url || 'http://localhost', anonKey || 'public-anon-key')
