
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.7';

/**
 * CARA SETUP DI SUPABASE:
 * 1. Buat Project di supabase.com
 * 2. Masuk ke SQL Editor, jalankan perintah untuk membuat tabel:
 *    - employees (id, name, username, password, role, gapok, uang_makan, payroll_method, is_active)
 *    - attendance (id, user_id, date, clock_in, clock_out, latitude, longitude, status, is_late, leave_request_id)
 *    - leave_requests (id, user_id, date, reason, status, evidence_photo)
 *    - config (id, latitude, longitude, radius, clock_in_time)
 *    - payroll_adjustments (user_id, bonus, deduction)
 */

// Gunakan process.env jika di-deploy di Vercel/Cloudflare, atau ganti langsung string di bawah untuk testing
const supabaseUrl = process.env.SUPABASE_URL || 'https://your-project-url.supabase.co';
const supabaseAnonKey = process.env.SUPABASE_ANON_KEY || 'your-anon-key';

export const supabase = createClient(supabaseUrl, supabaseAnonKey);
