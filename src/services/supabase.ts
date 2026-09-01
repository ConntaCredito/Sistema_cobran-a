import { createClient } from '@supabase/supabase-js';

export const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || 'https://lqnmzfvajlnfywpgblfa.supabase.co';
export const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imxxbm16ZnZhamxuZnl3cGdibGZhIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODY2MjIwODAsImV4cCI6MjEwMjE5ODA4MH0.NtKPftAleRmeesFm-L3cXlAu-q0fEqDF2Dlqe3nx-mc';
export const supabaseServiceKey = import.meta.env.VITE_SUPABASE_SERVICE_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imxxbm16ZnZhamxuZnl3cGdibGZhIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc4NjYyMjA4MCwiZXhwIjoyMTAyMTk4MDgwfQ.crTgKNGzvPa8kkXdHH0BNIlCBz2GY5J49Vov31jzsW8';

export const supabase = createClient(supabaseUrl, supabaseAnonKey);
// Cliente admin que ignora as regras RLS do banco de dados (exclusivo para ambiente interno/seguro)
export const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey, {
  auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false }
});
