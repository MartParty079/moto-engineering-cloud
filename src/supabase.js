import { createClient } from '@supabase/supabase-js'

const supabaseUrl=import.meta.env.VITE_SUPABASE_URL||'https://bxqexjvwxtnlflznyqyq.supabase.co'
const supabaseKey=import.meta.env.VITE_SUPABASE_ANON_KEY||import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY||'sb_publishable_nwyH_NCP2tXE8BXf7zcDAg_dfBSm02M'

export const supabase=createClient(supabaseUrl,supabaseKey)
