// components/supabaseConfig.ts
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://omoinlmgsdtlzfasydgw.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9tb2lubG1nc2R0bHpmYXN5ZGd3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzI1NzQ2NjQsImV4cCI6MjA4ODE1MDY2NH0.82r2RfmPGkwKOwtyY8O5mu_fZUPk3qCEePTEW9c4n6A';

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);