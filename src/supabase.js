import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = 'https://zvhsmlchqlujjnbcuvbs.supabase.co'
const SUPABASE_KEY = 'sb_publishable_VxvBDlrdOwGMP3IxR_B0oQ_gLhbpKBg'

export const supabase = createClient(SUPABASE_URL, SUPABASE_KEY)
