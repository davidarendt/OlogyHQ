import { createClient } from '@supabase/supabase-js';

// Used only for real-time subscriptions on the Taproom Inspections page.
// All data reads/writes go through the OlogyHQ Express API.
// The anon key is intentionally public — it only grants subscription access
// and all writes are gated through the authenticated Express API.
export const supabase = createClient(
  'https://ozuhfcinbelfxpidxdai.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im96dWhmY2luYmVsZnhwaWR4ZGFpIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzU4NjkyNjQsImV4cCI6MjA5MTQ0NTI2NH0.MdVpfYDu08kemgxU7biiB4kqLA1L54-XjBox9fzlzAA'
);
