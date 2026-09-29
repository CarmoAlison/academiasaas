import { createTenantCrud } from './crudFactory'

/** Unidades da academia */
export const unitService = createTenantCrud('units')

/** Planos da academia */
export const planService = createTenantCrud('plans')

/** Biblioteca de exercícios */
export const exerciseService = createTenantCrud('exercises')
