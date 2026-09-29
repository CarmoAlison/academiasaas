import { isHexColor, readableOn, shade, tint } from '../../utils/color'
import { PAYMENT_METHODS } from '../../utils/constants'
import { valorPorExtenso } from '../../utils/extenso'
import { formatCEP, formatCNPJ, formatCPF, formatCurrency, formatDate, formatPhone, toDate } from '../../utils/formatters'

/** Personalização padrão (quando a academia ainda não configurou) */
export const DEFAULT_RECEIPT_CONFIG = {
  logo_url: null,
  cor: '#006EB8',
  estilo: 'moderno',
  titulo: 'Recibo de pagamento',
  mensagem: 'Obrigado por treinar conosco!',
  rodape: '',
  cidade: '',
  exibir_cnpj: true,
  exibir_endereco: true,
  exibir_contato: true,
  exibir_assinatura: true,
  exibir_selo: true,
  assinatura_nome: '',
  assinatura_cargo: 'Responsável financeiro',
  assinatura_modo: 'linha', // 'linha' | 'imagem' | 'cursiva'
  assinatura_url: null,
}

/** Fonte cursiva da assinatura (OFL, servida de /public/fonts) */
export const SIGNATURE_FONT_PATH = '/fonts/GreatVibes-Regular.ttf'

const dataPorExtenso = (d) => d.toLocaleDateString('pt-BR', { day: 'numeric', month: 'long', year: 'numeric' })

/**
 * Converte o retorno de get_receipt em um modelo pronto para renderizar (HTML e PDF).
 * @param {object} data retorno da RPC get_receipt (ou dados de exemplo)
 * @param {object} [overrideConfig] personalização em edição (pré-visualização)
 */
export function buildReceiptModel(data, overrideConfig) {
  const cfg = { ...DEFAULT_RECEIPT_CONFIG, ...(data.config ?? {}), ...(overrideConfig ?? {}) }
  const { pagamento: p, aluno, academia, unidade, plano } = data
  const pagoEm = toDate(p.pago_em) ?? new Date()
  const venc = toDate(p.vencimento)
  // competência: coluna própria (fatura SaaS) ou o mês do vencimento (mensalidade do aluno)
  const comp = toDate(p.competencia) ?? venc

  const endereco = unidade
    ? [
        unidade.endereco,
        [unidade.cidade, unidade.estado].filter(Boolean).join('/'),
        unidade.cep ? `CEP ${formatCEP(unidade.cep)}` : null,
      ]
        .filter(Boolean)
        .join(' · ')
    : ''
  const telefone = unidade?.telefone || academia?.telefone
  const contato = [telefone ? formatPhone(telefone) : null, academia?.email].filter(Boolean).join(' · ')
  const cidade = cfg.cidade || unidade?.cidade || ''

  const referencia = [
    p.descricao || 'Mensalidade',
    plano ? `Plano ${plano.nome}` : null,
    comp ? `competência ${String(comp.getMonth() + 1).padStart(2, '0')}/${comp.getFullYear()}` : null,
  ]
    .filter(Boolean)
    .join(' · ')

  // cor inválida (ex.: sendo digitada na personalização) cai no padrão
  const accent = isHexColor(cfg.cor) ? cfg.cor : DEFAULT_RECEIPT_CONFIG.cor

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
      cnpj: cfg.exibir_cnpj && academia?.cnpj ? `CNPJ ${formatCNPJ(academia.cnpj)}` : '',
      endereco: cfg.exibir_endereco ? endereco : '',
      contato: cfg.exibir_contato ? contato : '',
    },
    numero: String(p.numero ?? 0).padStart(6, '0'),
    codigo: String(p.id).replace(/-/g, '').slice(0, 8).toUpperCase().replace(/(.{4})/, '$1-'),
    valor: formatCurrency(p.valor),
    valorExtenso: valorPorExtenso(p.valor),
    // pagador: aluno (CPF) ou, no recibo da assinatura SaaS, a academia (CNPJ)
    aluno: {
      nome: aluno?.nome ?? '',
      documento: aluno?.cnpj ? `CNPJ ${formatCNPJ(aluno.cnpj)}` : aluno?.cpf ? `CPF ${formatCPF(aluno.cpf)}` : '',
    },
    referencia,
    detalhes: [
      ['Data do pagamento', pagoEm.toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })],
      ['Forma de pagamento', PAYMENT_METHODS.find((m) => m.value === p.forma_pagamento)?.label ?? 'Não informada'],
      ['Vencimento', venc ? formatDate(p.vencimento) : '—'],
      ['Recebido por', p.recebido_por || academia?.nome || '—'],
    ],
    localData: `${cidade ? `${cidade}, ` : ''}${dataPorExtenso(pagoEm)}`,
    assinatura: (() => {
      const nome = cfg.assinatura_nome || academia?.nome || ''
      // modo 'imagem' sem imagem enviada cai para 'linha'
      const modo = cfg.assinatura_modo === 'imagem' && !cfg.assinatura_url ? 'linha' : cfg.assinatura_modo || 'linha'
      return {
        exibir: cfg.exibir_assinatura,
        modo,
        imagem: modo === 'imagem' ? cfg.assinatura_url : null,
        cursiva: modo === 'cursiva' ? nome : null,
        // nomes longos diminuem para caber numa linha (~16 caracteres no tamanho cheio)
        cursivaEscala: Math.max(0.5, Math.min(1, 16 / Math.max(nome.length, 1))),
        nome,
        cargo: cfg.assinatura_cargo || '',
      }
    })(),
    fileName: `recibo-${String(p.numero ?? 0).padStart(6, '0')}-${(aluno?.nome ?? 'aluno').split(' ')[0].toLowerCase()}.pdf`,
  }
}

/** Dados fictícios para a pré-visualização na tela de personalização */
export function sampleReceiptData({ academia, unidade, recebidoPor }) {
  const hoje = new Date()
  return {
    pagamento: {
      id: '7f3a9c21-0000-4000-8000-000000000000',
      numero: 42,
      descricao: 'Mensalidade',
      valor: 149.9,
      vencimento: `${hoje.getFullYear()}-${String(hoje.getMonth() + 1).padStart(2, '0')}-10`,
      pago_em: hoje.toISOString(),
      forma_pagamento: 'pix',
      recebido_por: recebidoPor,
    },
    plano: { nome: 'Mensal', duracao_meses: 1 },
    aluno: { nome: 'Ana Souza (exemplo)', cpf: '52998224725' },
    academia,
    unidade,
    config: null,
  }
}

/**
 * Exemplo do recibo da assinatura SaaS: emissor = empresa do SaaS, pagador = uma academia.
 * @param {{ settings: object, recebidoPor: string }} params settings = saas_settings.dados
 */
export function sampleSaasReceiptData({ settings = {}, recebidoPor }) {
  const hoje = new Date()
  const mes = `${hoje.getFullYear()}-${String(hoje.getMonth() + 1).padStart(2, '0')}`
  const digits = (v) => String(v ?? '').replace(/\D/g, '') || null
  return {
    pagamento: {
      id: '5a2e8f10-0000-4000-8000-000000000000',
      numero: 7,
      descricao: 'Assinatura do sistema',
      valor: 299.9,
      vencimento: `${mes}-10`,
      competencia: `${mes}-01`,
      pago_em: hoje.toISOString(),
      forma_pagamento: 'pix',
      recebido_por: recebidoPor,
    },
    plano: { nome: 'Pro' },
    aluno: { nome: 'Academia Exemplo Fitness', cnpj: '11222333000181' },
    academia: {
      nome: settings.nome || 'Academia SaaS',
      cnpj: digits(settings.cnpj),
      email: settings.email_suporte || null,
      telefone: digits(settings.telefone),
    },
    unidade: { endereco: settings.endereco, cidade: settings.cidade, estado: settings.estado, cep: digits(settings.cep) },
    config: null,
  }
}
