/**
 * Supabase client for React Native.
 * Uses the same Supabase project as the web app.
 */

import { createClient } from '@supabase/supabase-js';
import AsyncStorage from '@react-native-async-storage/async-storage';

const SUPABASE_URL = 'https://hzjfkkxcemvirvybwrdc.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_YLH1s2DmyDntMFKTV3-iJA_GvQGSq5j';

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    storage: AsyncStorage,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
});
