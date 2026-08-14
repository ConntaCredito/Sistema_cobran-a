import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;
const supabaseServiceKey = import.meta.env.VITE_SUPABASE_SERVICE_KEY || supabaseAnonKey;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error('Supabase URL e Anon Key precisam ser configurados no arquivo .env');
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey);
// Cliente admin que ignora as regras RLS do banco de dados (exclusivo para ambiente interno/seguro)
export const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);
