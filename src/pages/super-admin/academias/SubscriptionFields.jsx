import { useQuery } from '@tanstack/react-query'
import { Check, Star } from 'lucide-react'
import PriceBreakdown from '../../../components/billing/PriceBreakdown'
import { Checkbox, Select } from '../../../components/ui'
import { listSaasAddons, listSaasOffers, listSaasPlans, offerUsage } from '../../../services/saasService'
import { formatCurrency, formatDate, toISODate } from '../../../utils/formatters'
import { annualMonthly, calcSubscription } from '../../../utils/saasPricing'
import styles from './SubscriptionFields.module.css'

/** Meses de hoje até a data (inclusive o mês atual); null = sem fim */
function monthsUntil(dateIso) {
  if (!dateIso) return null
  const [y, m] = dateIso.split('-').map(Number)
  const now = new Date()
  return Math.max(0, (y - now.getFullYear()) * 12 + (m - 1 - now.getMonth()) + 1)
}

/** Motivo de a oferta não poder ser aplicada (null = disponível) */
function offerBlock(o, { uf, cidade, usage, currentOfferId }) {
  if (o.id === currentOfferId) return null // já aplicada: continua valendo
  if (!o.ativo) return 'inativa'
  if (o.valido_ate && o.valido_ate < toISODate()) return 'encerrada'
  if (o.uf && (uf ?? '').toUpperCase() !== o.uf.toUpperCase()) return `só ${o.uf}`
  if (o.cidade && (cidade ?? '').toLowerCase() !== o.cidade.toLowerCase()) return `só ${o.cidade}`
  if (o.limite_academias && (usage[o.id] ?? 0) >= o.limite_academias) return 'sem vagas'
  return null
}

/**
 * Plano + ciclo + adicionais + oferta, com o preço calculado na hora.
 * @param {{ value: { plan: string, ciclo: string, addons: string[], offer: string|null }, onChange: (v: object) => void,
 *           uf?: string, cidade?: string, currentOfferId?: string|null }} props
 */
export default function SubscriptionFields({ value, onChange, uf, cidade, currentOfferId = null, ofertaAte = null }) {
  const plans = useQuery({ queryKey: ['saas-plans'], queryFn: listSaasPlans })
  const addons = useQuery({ queryKey: ['saas-addons'], queryFn: listSaasAddons })
  const offers = useQuery({ queryKey: ['saas-offers'], queryFn: listSaasOffers })
  const usage = useQuery({ queryKey: ['saas-offers', 'usage'], queryFn: offerUsage })

  const set = (patch) => onChange({ ...value, ...patch })
  const plan = plans.data?.find((p) => p.id === value.plan)
  const chosenAddons = (addons.data ?? []).filter((a) => value.addons.includes(a.id))
  const offer = offers.data?.find((o) => o.id === value.offer) ?? null
  // oferta já aplicada: conta só os meses que ainda restam até o fim dela
  const offerMonthsLeft = offer && offer.id === currentOfferId ? monthsUntil(ofertaAte) : null
  const price = calcSubscription({ plan, ciclo: value.ciclo, addons: chosenAddons, offer, offerMonthsLeft })
  const ctx = { uf, cidade, usage: usage.data ?? {}, currentOfferId }

  return (
    <div className={styles.wrap}>
      <div className={styles.cycle} role="radiogroup" aria-label="Ciclo de cobrança">
        {['mensal', 'anual'].map((c) => (
          <button key={c} type="button" role="radio" aria-checked={value.ciclo === c} className={value.ciclo === c ? styles.on : ''} onClick={() => set({ ciclo: c })}>
            {c === 'mensal' ? 'Mensal' : 'Anual'}
            {c === 'anual' && plan && Number(plan.desconto_anual_pct) > 0 && <span>−{Number(plan.desconto_anual_pct)}%</span>}
          </button>
        ))}
      </div>

      <div className={styles.plans} role="radiogroup" aria-label="Plano">
        {(plans.data ?? [])
          .filter((p) => p.ativo || p.id === value.plan)
          .map((p) => (
            <button
              key={p.id}
              type="button"
              role="radio"
              aria-checked={value.plan === p.id}
              className={`${styles.plan} ${value.plan === p.id ? styles.selected : ''}`}
              onClick={() => set({ plan: p.id })}
            >
              {p.destaque && (
                <span className={styles.star}>
                  <Star size={12} /> Mais vendido
                </span>
              )}
              <strong>{p.nome}</strong>
              <span className={styles.price}>
                {formatCurrency(value.ciclo === 'anual' ? annualMonthly(p) : p.valor)}
                <small>/mês</small>
              </span>
              <small className="text-muted">
                {p.limite_alunos ? `até ${p.limite_alunos} alunos` : 'alunos ilimitados'} ·{' '}
                {p.limite_unidades ? `${p.limite_unidades} unidade(s)` : 'unidades ilimitadas'}
              </small>
            </button>
          ))}
      </div>

      {(addons.data ?? []).some((a) => a.ativo || value.addons.includes(a.id)) && (
        <div className={styles.section}>
          <span className={styles.label}>Adicionais</span>
          {(addons.data ?? [])
            .filter((a) => a.ativo || value.addons.includes(a.id))
            .map((a) => (
              <Checkbox
                key={a.id}
                label={
                  <>
                    <strong>{a.nome}</strong> — {formatCurrency(a.valor)}/mês
                    {a.descricao && <small className={styles.addonDesc}>{a.descricao}</small>}
                  </>
                }
                checked={value.addons.includes(a.id)}
                onChange={(on) => set({ addons: on ? [...value.addons, a.id] : value.addons.filter((x) => x !== a.id) })}
              />
            ))}
        </div>
      )}

      <Select
        label="Oferta / promoção"
        placeholder="Sem oferta"
        value={value.offer ?? ''}
        onChange={(e) => set({ offer: e.target.value || null })}
        options={(offers.data ?? []).map((o) => {
          const block = offerBlock(o, ctx)
          const vagas = o.limite_academias ? ` · ${Math.max(0, o.limite_academias - (usage.data?.[o.id] ?? 0))} vaga(s)` : ''
          return {
            value: o.id,
            label: `${o.nome} — ${Number(o.desconto_pct)}%${o.meses ? ` por ${o.meses} mês(es)` : ''}${vagas}${block ? ` (${block})` : ''}`,
            disabled: Boolean(block),
          }
        })}
        hint={
          offer
            ? `${offer.uf || offer.cidade ? `Região: ${[offer.cidade, offer.uf].filter(Boolean).join('/')} · ` : ''}${offer.valido_ate ? `válida até ${formatDate(offer.valido_ate)}` : 'sem data de término'}`
            : 'Ofertas com região exigem a UF/cidade da academia preenchida'
        }
      />

      {price ? (
        <PriceBreakdown price={price} />
      ) : (
        <p className="text-muted" style={{ fontSize: 13 }}>
          <Check size={14} /> Escolha um plano para ver o valor.
        </p>
      )}
    </div>
  )
}
