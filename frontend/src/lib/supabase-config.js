// These are public application identifiers, never an administrative database key.
export const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL || ''
export const SUPABASE_KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY || ''
export const SUPABASE = !!(SUPABASE_URL && SUPABASE_KEY)
