import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.SUPABASE_URL || '';
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

export const isSupabaseConfigured = Boolean(supabaseUrl && supabaseServiceKey);

// We export a function instead of a raw instance so we can throw if someone tries to use it without config
export function getSupabaseServerClient() {
  if (!isSupabaseConfigured) {
    throw new Error('SUPABASE_NOT_CONFIGURED');
  }
  
  // Use service role key to bypass RLS and allow safe backend uploading
  return createClient(supabaseUrl, supabaseServiceKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    }
  });
}
