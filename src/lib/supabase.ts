import { createClient } from '@supabase/supabase-js'

// Only the publishable anon key is used in the browser; the service_role key
// must never appear in client code (all enforcement is RLS, spec §9 / tech-stack §4).
const url = import.meta.env.VITE_SUPABASE_URL
const anonKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY

if (!url || !anonKey) {
  throw new Error(
    'Supabase 환경 변수가 없습니다. .env에 VITE_SUPABASE_URL과 VITE_SUPABASE_PUBLISHABLE_KEY를 설정하세요.',
  )
}

// A single client instance app-wide — multiple createClient() calls race on the
// auth session and break onAuthStateChange.
export const supabase = createClient(url, anonKey)
