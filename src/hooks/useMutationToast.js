import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useToast } from '../components/ui/Toast'
import { errorMessage } from '../utils/errors'

/**
 * useMutation com toast de sucesso/erro e invalidação de queries.
 * @param {(vars: any) => Promise<any>} mutationFn
 * @param {{ success?: string | ((data: any, vars: any) => string), invalidate?: any[][], onSuccess?: (data: any, vars: any) => void }} [options]
 */
export function useMutationToast(mutationFn, { success, invalidate = [], onSuccess } = {}) {
  const toast = useToast()
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn,
    onSuccess: async (data, vars) => {
      await Promise.all(invalidate.map((queryKey) => queryClient.invalidateQueries({ queryKey })))
      const msg = typeof success === 'function' ? success(data, vars) : success
      if (msg) toast.success(msg)
      onSuccess?.(data, vars)
    },
    onError: (error) => toast.error(errorMessage(error)),
  })
}
