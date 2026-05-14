import { createClient } from '@supabase/supabase-js'

const stripBOM = (str: string) => str.charCodeAt(0) === 0xFEFF ? str.slice(1) : str

const supabaseUrl = stripBOM(process.env.NEXT_PUBLIC_SUPABASE_URL!)
const supabaseAnonKey = stripBOM(process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!)

export const supabase = createClient(supabaseUrl, supabaseAnonKey)
