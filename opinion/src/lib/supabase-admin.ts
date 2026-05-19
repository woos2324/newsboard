import { createClient } from '@supabase/supabase-js'

const stripBOM = (str: string) => str.charCodeAt(0) === 0xFEFF ? str.slice(1) : str

const supabaseUrl = stripBOM(process.env.NEXT_PUBLIC_SUPABASE_URL!)
const serviceRoleKey = stripBOM(process.env.SUPABASE_SERVICE_ROLE_KEY!)

export const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey, {
  auth: { persistSession: false, autoRefreshToken: false },
})
