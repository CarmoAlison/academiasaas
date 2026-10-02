import { supabase, unwrap } from './supabaseClient'

export const ANNOUNCEMENT_TYPES = [
  { value: 'info', label: 'Informação' },
  { value: 'novidade', label: 'Novidade' },
  { value: 'manutencao', label: 'Manutenção' },
  { value: 'urgente', label: 'Urgente' },
]

export const ANNOUNCEMENT_AUDIENCES = [
  { value: 'equipe', label: 'Equipe das academias' },
  { value: 'todos', label: 'Equipe e alunos' },
]

/** Todos os avisos (Super Admin) */
export const listAnnouncements = () =>
  unwrap(supabase.from('announcements').select('*, academy:academies(id, nome)').order('created_at', { ascending: false }))

/** Avisos vigentes para o usuário logado (a RLS filtra público, academia e período) */
export const listActiveAnnouncements = () =>
  unwrap(
    supabase
      .from('announcements')
      .select('id, titulo, mensagem, tipo, link, academy_id, publico, inicio, fim, ativo')
      .eq('ativo', true)
      .order('inicio', { ascending: false })
      .limit(10),
  )

const clean = (v) => ({
  titulo: v.titulo.trim(),
  mensagem: v.mensagem?.trim() || null,
  tipo: v.tipo,
  publico: v.publico,
  academy_id: v.academy_id || null,
  link: v.link?.trim() || null,
  inicio: v.inicio ? new Date(v.inicio).toISOString() : new Date().toISOString(),
  fim: v.fim ? new Date(v.fim).toISOString() : null,
  ativo: Boolean(v.ativo),
})

export const saveAnnouncement = (id, values) =>
  unwrap(id ? supabase.from('announcements').update(clean(values)).eq('id', id) : supabase.from('announcements').insert(clean(values)))

export const toggleAnnouncement = (id, ativo) => unwrap(supabase.from('announcements').update({ ativo }).eq('id', id))

export const removeAnnouncement = (id) => unwrap(supabase.from('announcements').delete().eq('id', id))
