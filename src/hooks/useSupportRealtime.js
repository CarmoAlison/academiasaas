import { useQueryClient } from '@tanstack/react-query'
import { useEffect } from 'react'
import { supabase } from '../services/supabaseClient'

/**
 * Escuta mudanças nos chamados (abertura, status, lido/não lido) e atualiza listas e contadores
 * na hora. A RLS do Realtime garante que cada um só recebe os chamados que pode ver.
 * @param {boolean} [enabled]
 */
export function useSupportRealtime(enabled = true) {
  const queryClient = useQueryClient()

  useEffect(() => {
    if (!enabled) return undefined
    const channel = supabase
      .channel(`support-tickets-${Math.random().toString(36).slice(2)}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'support_tickets' }, (payload) => {
        const row = payload.new
        // aplica a mudança direto no cache (sem esperar nova consulta) e confirma em seguida
        if (payload.eventType === 'UPDATE' && row?.id) {
          queryClient.setQueriesData({ queryKey: ['tickets'] }, (old) =>
            Array.isArray(old) ? old.map((t) => (t.id === row.id ? { ...t, ...row, academy: t.academy } : t)) : old,
          )
        }
        queryClient.invalidateQueries({ queryKey: ['tickets'] })
        queryClient.invalidateQueries({ queryKey: ['tickets-unread'] })
      })
      .subscribe()
    return () => {
      supabase.removeChannel(channel)
    }
  }, [enabled, queryClient])
}

/**
 * Mensagens novas de um chamado chegam na hora (sem esperar o intervalo de atualização).
 * @param {string} ticketId
 */
export function useTicketMessagesRealtime(ticketId) {
  const queryClient = useQueryClient()

  useEffect(() => {
    if (!ticketId) return undefined
    const key = ['ticket-messages', ticketId]
    const channel = supabase
      .channel(`support-messages-${ticketId}-${Math.random().toString(36).slice(2)}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'support_messages', filter: `ticket_id=eq.${ticketId}` },
        (payload) => {
          const msg = payload.new
          queryClient.setQueryData(key, (old) => {
            const list = old ?? []
            if (list.some((m) => m.id === msg.id)) return list
            // troca a mensagem "enviando…" (otimista) pela definitiva
            const pendingIdx = list.findIndex((m) => m.pending && m.mensagem === msg.mensagem)
            if (pendingIdx >= 0) return list.map((m, i) => (i === pendingIdx ? msg : m))
            return [...list, msg]
          })
        },
      )
      .subscribe()
    return () => {
      supabase.removeChannel(channel)
    }
  }, [ticketId, queryClient])
}

/** Atualiza o status de um chamado em todas as listas em cache (resposta instantânea na tela) */
export function patchTicketInCache(queryClient, ticketId, patch) {
  queryClient.setQueriesData({ queryKey: ['tickets'] }, (old) =>
    Array.isArray(old) ? old.map((t) => (t.id === ticketId ? { ...t, ...patch } : t)) : old,
  )
}
