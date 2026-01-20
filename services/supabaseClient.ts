
import { createClient } from '@supabase/supabase-js';

const getEnv = (name: string): string => {
  // Mencoba berbagai kemungkinan nama variable environment
  if (typeof process !== 'undefined' && process.env) {
    if (process.env[name]) return process.env[name];
    if (name === 'VITE_SUPABASE_URL' && process.env.API_URL) return process.env.API_URL;
    if (name === 'VITE_SUPABASE_ANON_KEY' && process.env.API_KEY) return process.env.API_KEY;
  }
  
  const metaEnv = (import.meta as any).env;
  if (metaEnv) {
    if (metaEnv[name]) return metaEnv[name];
    if (name === 'VITE_SUPABASE_URL' && metaEnv.VITE_API_URL) return metaEnv.VITE_API_URL;
  }
  
  return '';
};

const supabaseUrl = getEnv('VITE_SUPABASE_URL');
const supabaseAnonKey = getEnv('VITE_SUPABASE_ANON_KEY');

const isUrlValid = (url: string) => {
  try {
    return url && (url.startsWith('http://') || url.startsWith('https://'));
  } catch {
    return false;
  }
};

const createMockSupabase = () => {
  console.warn("Sistem berjalan dalam mode offline/mock. Hubungkan Supabase URL & Key untuk sinkronisasi cloud.");
  const mockResponse = { data: null, error: null, count: 0 };
  const mockQueryResponse = { data: [], error: null, count: 0 };

  const createChain = (isQuery: boolean) => {
    const response = isQuery ? mockQueryResponse : mockResponse;
    const chainObj = Object.assign(Promise.resolve(response), {
      select: () => createChain(true),
      insert: () => createChain(false),
      update: () => createChain(false),
      delete: () => createChain(false),
      upsert: () => createChain(false),
      match: () => createChain(isQuery),
      eq: () => createChain(isQuery),
      order: () => createChain(isQuery),
      limit: () => createChain(isQuery),
      single: () => createChain(false),
      maybeSingle: () => createChain(false),
    });
    return chainObj;
  };

  return {
    from: () => createChain(true),
    auth: {
      getSession: () => Promise.resolve({ data: { session: null }, error: null }),
      onAuthStateChange: () => ({ data: { subscription: { unsubscribe: () => {} } } }),
    }
  } as any;
};

export const supabase = isUrlValid(supabaseUrl) && supabaseAnonKey
  ? createClient(supabaseUrl, supabaseAnonKey)
  : createMockSupabase();
