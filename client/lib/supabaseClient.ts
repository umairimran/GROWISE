import { createClient } from '@supabase/supabase-js';

// Read Supabase credentials from environment so they match your project.
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.warn('Supabase URL/key missing. Please set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY in .env.local.');
}

export const supabase = createClient(supabaseUrl || '', supabaseKey || '');