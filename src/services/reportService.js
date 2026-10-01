import { supabase, unwrap } from './supabaseClient'

/**
 * Relatórios do período com filtros (unidade/plano opcionais)
 * @param {string} academyId
 * @param {{ de: string, ate: string, unit?: string, plan?: string }} filtros
 */
export const reportData = (academyId, { de, ate, unit, plan }) =>
  unwrap(
    supabase.rpc('report_data', {
      p_academy: academyId,
      p_de: de,
      p_ate: ate,
      p_unit: unit || null,
      p_plan: plan || null,
    }),
  )
