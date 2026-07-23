import { createClient } from '@supabase/supabase-js'
import { createMockSupabase } from './supabase-mock.js'

const supabaseUrl=import.meta.env.VITE_SUPABASE_URL||'https://bxqexjvwxtnlflznyqyq.supabase.co'
const supabaseKey=import.meta.env.VITE_SUPABASE_ANON_KEY||import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY||'sb_publishable_nwyH_NCP2tXE8BXf7zcDAg_dfBSm02M'
const localHost=['localhost','127.0.0.1','::1'].includes(location.hostname)
const e2e=localHost&&new URLSearchParams(location.search).get('e2e')==='1'

export const supabase=e2e?createMockSupabase():createClient(supabaseUrl,supabaseKey)