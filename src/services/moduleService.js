import { supabase, unwrap } from './supabaseClient'

/** Catálogo de módulos do SaaS */
export const listModules = () => unwrap(supabase.from('saas_modules').select('*').order('ordem').order('nome'))

export const saveModule = (slug, values, isNew) => {
  const payload = {
    nome: values.nome.trim(),
    descricao: values.descricao?.trim() || null,
    grupo: values.grupo,
    ordem: Number(values.ordem || 100),
    ativo: Boolean(values.ativo),
  }
  return unwrap(
    isNew
      ? supabase.from('saas_modules').insert({ ...payload, slug: values.slug.trim().toLowerCase() })
      : supabase.from('saas_modules').update(payload).eq('slug', slug),
  )
}

/** Módulos liberados para a academia (plano + ajustes + essenciais) */
export const academyModules = (academyId) => unwrap(supabase.rpc('academy_modules', { p_academy: academyId }))

/** Ajustes da academia: { slug: true | false } (ausente = segue o plano) */
export const saveAcademyModules = (academyId, override) =>
  unwrap(supabase.from('academies').update({ modulos_override: override }).eq('id', academyId))
