import { nowISO, supabase, unwrap } from './supabaseClient'

/**
 * Serviço CRUD genérico para tabelas por academia com soft delete.
 * @param {string} table
 * @param {{ select?: string, orderBy?: string, ascending?: boolean }} [options]
 */
export function createTenantCrud(table, { select = '*', orderBy = 'nome', ascending = true } = {}) {
  return {
    /** @param {string} academyId */
    list: (academyId) =>
      unwrap(
        supabase
          .from(table)
          .select(select)
          .eq('academy_id', academyId)
          .is('deleted_at', null)
          .order(orderBy, { ascending }),
      ),

    /** @param {string} id */
    get: (id) => unwrap(supabase.from(table).select(select).eq('id', id).is('deleted_at', null).single()),

    /** @param {string} academyId @param {object} values */
    create: (academyId, values) =>
      unwrap(supabase.from(table).insert({ ...values, academy_id: academyId }).select('id').single()),

    /** @param {string} id @param {object} values */
    update: (id, values) => unwrap(supabase.from(table).update(values).eq('id', id)),

    /** Soft delete */
    remove: (id) => unwrap(supabase.from(table).update({ deleted_at: nowISO() }).eq('id', id)),
  }
}
