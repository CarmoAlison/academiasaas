import { isHexColor, readableOn, shade, tint } from '../../utils/color'
import { formatCEP, formatCNPJ, formatCPF, formatPhone } from '../../utils/formatters'
import { DEFAULT_RECEIPT_CONFIG } from '../receipt/receiptModel'
import { parseContract } from './contractFormat'

const dataHora = (iso) => new Date(iso).toLocaleString('pt-BR', { dateStyle: 'long', timeStyle: 'short' })

/**
 * Modelo do contrato para HTML e PDF, com o visual (cor, logo, estilo, assinatura)
 * da personalização do recibo da academia.
 * @param {object} data retorno de get_contract
 */
export function buildContractModel(data) {
  const cfg = { ...DEFAULT_RECEIPT_CONFIG, ...(data.config ?? {}) }
  const { contrato: c, aluno, academia, unidade } = data
  // contrato do SaaS: quem assina é a academia (CNPJ) pelo painel dela
  const saas = data.tipo === 'saas'
  const contratante = saas
    ? { nome: data.contratante?.nome ?? '', doc: data.contratante?.cnpj ? `CNPJ ${formatCNPJ(data.contratante.cnpj)}` : '' }
    : { nome: aluno?.nome ?? '', doc: aluno?.cpf ? `CPF ${formatCPF(aluno.cpf)}` : '' }
  const accent = isHexColor(cfg.cor) ? cfg.cor : DEFAULT_RECEIPT_CONFIG.cor

  const endereco = unidade
    ? [unidade.endereco, [unidade.cidade, unidade.estado].filter(Boolean).join('/'), unidade.cep ? `CEP ${formatCEP(unidade.cep)}` : null]
        .filter(Boolean)
        .join(' · ')
    : ''
  const telefone = unidade?.telefone || academia?.telefone
  const contato = [telefone ? formatPhone(telefone) : null, academia?.email].filter(Boolean).join(' · ')
  const assinaturaNome = cfg.assinatura_nome || academia?.nome || ''
  // texto com formatação (títulos, negrito, listas...) → blocos
  const blocos = parseContract(c.conteudo)
  const modo = cfg.assinatura_modo === 'imagem' && !cfg.assinatura_url ? 'linha' : cfg.assinatura_modo || 'linha'

  return {
    cfg,
    colors: {
      accent,
      accentText: readableOn(accent),
      accentTint: tint(accent, 0.9),
      accentSoft: tint(accent, 0.8),
      accentDeep: shade(accent, 0.25),
    },
    logo: cfg.logo_url || academia?.logo_url || null,
    logoCompleta: Boolean(cfg.logo_completa && (cfg.logo_url || academia?.logo_url)),
    academia: {
      nome: academia?.nome ?? '',
      iniciais: (academia?.nome ?? '?').trim().split(/\s+/).slice(0, 2).map((w) => w[0]).join('').toUpperCase(),
      cnpj: academia?.cnpj ? `CNPJ ${formatCNPJ(academia.cnpj)}` : '',
      rodape: [endereco, contato].filter(Boolean).join(' · '),
    },
    titulo: c.titulo,
    blocos,
    // o texto já começa com um título: não repete o título do contrato
    temCabecalho: blocos[0]?.type === 'h1',
    status: c.status,
    aluno: { nome: aluno?.nome ?? '', cpf: aluno?.cpf ? formatCPF(aluno.cpf) : '' },
    contratante,
    textos: saas
      ? { aguardando: 'Aguardando assinatura da academia', via: '(CPF e senha) no painel da academia' }
      : { aguardando: 'Aguardando aceite do aluno', via: '(CPF e senha) na área do aluno' },
    aceite:
      c.status === 'aceito'
        ? {
            em: dataHora(c.aceito_em),
            ip: c.aceite_ip || 'não identificado',
            nome: c.aceite_nome,
            cpf: c.aceite_cpf ? formatCPF(c.aceite_cpf) : '',
          }
        : null,
    emitidoEm: dataHora(c.created_at),
    codigo: (c.hash ?? '').slice(0, 16).toUpperCase().replace(/(.{4})(?=.)/g, '$1-'),
    assinatura: {
      modo,
      imagem: modo === 'imagem' ? cfg.assinatura_url : null,
      cursiva: modo === 'cursiva' ? assinaturaNome : null,
      cursivaEscala: Math.max(0.5, Math.min(1, 16 / Math.max(assinaturaNome.length, 1))),
      nome: assinaturaNome,
      cargo: cfg.assinatura_cargo || '',
    },
    fileName: `contrato-${(contratante.nome || 'aluno').split(' ')[0].toLowerCase()}-${String(c.id).slice(0, 8)}.pdf`,
  }
}
