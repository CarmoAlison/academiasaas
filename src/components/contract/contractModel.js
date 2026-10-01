import { isHexColor, readableOn, shade, tint } from '../../utils/color'
import { formatCEP, formatCNPJ, formatCPF, formatPhone } from '../../utils/formatters'
import { DEFAULT_RECEIPT_CONFIG } from '../receipt/receiptModel'

const dataHora = (iso) => new Date(iso).toLocaleString('pt-BR', { dateStyle: 'long', timeStyle: 'short' })

/**
 * Modelo do contrato para HTML e PDF, com o visual (cor, logo, estilo, assinatura)
 * da personalização do recibo da academia.
 * @param {object} data retorno de get_contract
 */
export function buildContractModel(data) {
  const cfg = { ...DEFAULT_RECEIPT_CONFIG, ...(data.config ?? {}) }
  const { contrato: c, aluno, academia, unidade } = data
  const accent = isHexColor(cfg.cor) ? cfg.cor : DEFAULT_RECEIPT_CONFIG.cor

  const endereco = unidade
    ? [unidade.endereco, [unidade.cidade, unidade.estado].filter(Boolean).join('/'), unidade.cep ? `CEP ${formatCEP(unidade.cep)}` : null]
        .filter(Boolean)
        .join(' · ')
    : ''
  const telefone = unidade?.telefone || academia?.telefone
  const contato = [telefone ? formatPhone(telefone) : null, academia?.email].filter(Boolean).join(' · ')
  const assinaturaNome = cfg.assinatura_nome || academia?.nome || ''
  // blocos separados por linha em branco viram parágrafos
  const paragrafos = c.conteudo.split(/\n\s*\n/).map((p) => p.trim()).filter(Boolean)
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
    academia: {
      nome: academia?.nome ?? '',
      iniciais: (academia?.nome ?? '?').trim().split(/\s+/).slice(0, 2).map((w) => w[0]).join('').toUpperCase(),
      cnpj: academia?.cnpj ? `CNPJ ${formatCNPJ(academia.cnpj)}` : '',
      rodape: [endereco, contato].filter(Boolean).join(' · '),
    },
    titulo: c.titulo,
    paragrafos,
    // 1º bloco numa linha só e em MAIÚSCULAS = o texto já traz o título (não repete o título do contrato)
    temCabecalho: Boolean(paragrafos[0]) && !paragrafos[0].includes('\n') && /^[A-ZÀ-Ú0-9 .,:-]{8,}$/.test(paragrafos[0]),
    status: c.status,
    aluno: { nome: aluno?.nome ?? '', cpf: aluno?.cpf ? formatCPF(aluno.cpf) : '' },
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
    fileName: `contrato-${(aluno?.nome ?? 'aluno').split(' ')[0].toLowerCase()}-${String(c.id).slice(0, 8)}.pdf`,
  }
}
