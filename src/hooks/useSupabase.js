import { supabase } from '../services/supabaseClient'

/** Acesso ao client do Supabase (prefira os services por domínio) */
export function useSupabase() {
  return supabase
}
