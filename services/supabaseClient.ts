
import { createClient } from '@supabase/supabase-js';

// Membaca variable dari Netlify Environment Variables
// Penting: Di Netlify harus diawali dengan VITE_ agar bisa dibaca di client-side
const supabaseUrl = (import.meta as any).env?.VITE_SUPABASE_URL || '';
const supabaseAnonKey = (import.meta as any).env?.VITE_SUPABASE_ANON_KEY || '';

const isUrlValid = (url: string) => {
  try {
    return url && url.startsWith('http');
  } catch {
    return false;
  }
};

// Ekspor instance supabase. Jika URL tidak ada, aplikasi tetap jalan (mock mode)
export const supabase = isUrlValid(supabaseUrl) && supabaseAnonKey
  ? createClient(supabaseUrl, supabaseAnonKey)
  : new Proxy({}, {
      get: () => ({
        from: () => ({
          select: () => ({ 
            order: () => Promise.resolve({ data: [], error: null }), 
            maybeSingle: () => Promise.resolve({ data: null, error: null }) 
          }),
          insert: () => Promise.resolve({ data: null, error: null }),
          update: () => ({ 
            match: () => Promise.resolve({ data: null, error: null }),
            eq: () => Promise.resolve({ data: null, error: null }) 
          }),
          delete: () => ({ eq: () => Promise.resolve({ data: null, error: null }) }),
          upsert: () => Promise.resolve({ data: null, error: null })
        })
      })
    }) as any;
