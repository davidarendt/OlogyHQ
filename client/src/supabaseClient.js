import { createClient } from '@supabase/supabase-js';

// Used only for real-time subscriptions on the Taproom Inspections page.
// All data reads/writes go through the OlogyHQ Express API.
const SUPABASE_URL = process.env.REACT_APP_SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.REACT_APP_SUPABASE_ANON_KEY;

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
