import { supabase, unwrap } from './supabaseClient'

/** Métricas do dashboard da academia */
export const adminDashboard = (academyId) => unwrap(supabase.rpc('admin_dashboard', { p_academy: academyId }))

/** Métricas globais do SaaS */
export const superDashboard = () => unwrap(supabase.rpc('super_dashboard'))
