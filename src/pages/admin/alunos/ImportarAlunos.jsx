import { useQuery, useQueryClient } from '@tanstack/react-query'
import { AlertTriangle, CheckCircle2, Download, FileSpreadsheet, Upload } from 'lucide-react'
import { useRef, useState } from 'react'
import { Badge, Button, Modal } from '../../../components/ui'
import { useTenant } from '../../../hooks/useAuth'
import { planService, unitService } from '../../../services/catalogServices'
import { academyUsage, createStudent, listStudentCpfs } from '../../../services/studentService'
import { STUDENT_STATUS, UFS } from '../../../utils/constants'
import { exportCSV, parseCSV } from '../../../utils/csv'
import { errorMessage } from '../../../utils/errors'
import { formatCPF, onlyDigits, toISODate } from '../../../utils/formatters'
import { isEmail, isValidCPF } from '../../../utils/validators'
import styles from './ImportarAlunos.module.css'

/** Colunas da planilha modelo (a ordem não importa; o cabeçalho é reconhecido pelo nome) */
const COLUMNS = [
  { key: 'nome', label: 'nome', required: true, help: 'Nome completo', example: ['Maria da Silva', 'João Pereira'] },
  { key: 'cpf', label: 'cpf', required: true, help: 'Com ou sem pontuação. É o login do aluno.', example: ['529.982.247-25', '11144477735'] },
  { key: 'data_nascimento', label: 'data_nascimento', help: 'DD/MM/AAAA', example: ['15/03/1995', ''] },
  { key: 'telefone', label: 'telefone', help: 'Celular com DDD (WhatsApp)', example: ['(11) 98765-4321', '11912345678'] },
  { key: 'email_contato', label: 'email', help: 'E-mail de contato', example: ['maria@email.com', ''] },
  { key: 'plano', label: 'plano', help: 'Nome igual ao cadastrado em Planos', example: ['Mensal', 'Trimestral'] },
  { key: 'unidade', label: 'unidade', help: 'Nome da unidade (vazio = única unidade)', example: ['', ''] },
  { key: 'data_matricula', label: 'data_matricula', help: 'DD/MM/AAAA (vazio = hoje)', example: ['01/02/2024', ''] },
  { key: 'status', label: 'status', help: 'ativo, inativo ou trancado (vazio = ativo)', example: ['ativo', 'ativo'] },
  { key: 'responsavel', label: 'responsavel', help: 'Para menores de idade', example: ['', ''] },
  { key: 'cep', label: 'cep', help: '', example: ['01310-100', ''] },
  { key: 'endereco', label: 'endereco', help: 'Rua, número e complemento', example: ['Av. Paulista, 1000, ap 12', ''] },
  { key: 'cidade', label: 'cidade', help: '', example: ['São Paulo', ''] },
  { key: 'estado', label: 'uf', help: 'Sigla do estado', example: ['SP', ''] },
  { key: 'observacoes', label: 'observacoes', help: '', example: ['', 'Veio do sistema antigo'] },
]

/** Cabeçalhos aceitos além do nome oficial */
const ALIASES = {
  nome_completo: 'nome', aluno: 'nome',
  nascimento: 'data_nascimento', data_de_nascimento: 'data_nascimento', aniversario: 'data_nascimento',
  celular: 'telefone', whatsapp: 'telefone', fone: 'telefone',
  email: 'email_contato', e_mail: 'email_contato',
  matricula: 'data_matricula', data_de_matricula: 'data_matricula',
  situacao: 'status', estado: 'estado', uf: 'estado', observacao: 'observacoes', obs: 'observacoes',
}

const norm = (s) =>
  String(s ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .trim()
const headerKey = (h) => {
  const k = norm(h).replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '')
  return COLUMNS.find((c) => c.key === k || c.label === k)?.key ?? ALIASES[k] ?? null
}

/** "15/03/1995", "15-03-95" ou "1995-03-15" → "1995-03-15" (ou null se inválida) */
function parseDate(v) {
  if (!v) return ''
  let d, m, y
  const iso = v.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/)
  const br = v.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})$/)
  if (iso) [, y, m, d] = iso
  else if (br) [, d, m, y] = br
  else return null
  y = Number(y.length === 2 ? (Number(y) > 30 ? `19${y}` : `20${y}`) : y)
  const date = new Date(y, Number(m) - 1, Number(d))
  if (date.getFullYear() !== y || date.getMonth() !== Number(m) - 1 || date.getDate() !== Number(d)) return null
  if (y < 1900 || date > new Date()) return null
  return toISODate(date)
}

function baixarModelo() {
  exportCSV(
    'modelo-importacao-alunos',
    COLUMNS.map((c) => ({ header: c.label, value: (row) => row[c.key] })),
    [0, 1].map((i) => Object.fromEntries(COLUMNS.map((c) => [c.key, c.example[i]]))),
  )
}

/** Valida as linhas e monta os valores do cadastro */
function analisar(rows, { plans, units, cpfs }) {
  const [header, ...body] = rows
  const keys = header.map(headerKey)
  const faltando = ['nome', 'cpf'].filter((k) => !keys.includes(k))
  if (faltando.length) return { erroGeral: `A planilha precisa das colunas: ${faltando.join(', ')}. Baixe o modelo para conferir os nomes.` }

  const ativosPlanos = plans.filter((p) => p.ativo !== false)
  const vistos = new Set()
  const itens = body.map((cells, i) => {
    const raw = {}
    keys.forEach((k, j) => {
      if (k) raw[k] = cells[j] ?? ''
    })
    const erros = []
    const cpf = onlyDigits(raw.cpf)
    if (!raw.nome) erros.push('nome vazio')
    if (!isValidCPF(cpf)) erros.push('CPF inválido')
    else if (vistos.has(cpf)) erros.push('CPF repetido na planilha')
    vistos.add(cpf)

    const nascimento = parseDate(raw.data_nascimento)
    if (nascimento === null) erros.push('data de nascimento inválida')
    const matricula = parseDate(raw.data_matricula)
    if (matricula === null) erros.push('data de matrícula inválida')

    let plan_id = ''
    if (raw.plano) {
      const p = ativosPlanos.find((x) => norm(x.nome) === norm(raw.plano))
      if (p) plan_id = p.id
      else erros.push(`plano "${raw.plano}" não encontrado`)
    }
    let unit_id = units.length === 1 ? units[0].id : ''
    if (raw.unidade) {
      const u = units.find((x) => norm(x.nome) === norm(raw.unidade))
      if (u) unit_id = u.id
      else erros.push(`unidade "${raw.unidade}" não encontrada`)
    }
    const status = raw.status ? norm(raw.status) : 'ativo'
    if (!STUDENT_STATUS.some((s) => s.value === status)) erros.push(`status "${raw.status}" inválido`)
    const uf = (raw.estado ?? '').toUpperCase()
    if (uf && !UFS.includes(uf)) erros.push(`UF "${raw.estado}" inválida`)
    if (raw.email_contato && !isEmail(raw.email_contato)) erros.push('e-mail inválido')
    const tel = onlyDigits(raw.telefone)
    if (tel && (tel.length < 10 || tel.length > 13)) erros.push('telefone inválido')

    return {
      linha: i + 2,
      nome: raw.nome,
      cpf,
      jaExiste: erros.length === 0 && cpfs.has(cpf),
      erros,
      values: {
        nome: raw.nome,
        cpf,
        telefone: tel,
        email_contato: raw.email_contato ?? '',
        data_nascimento: nascimento || '',
        responsavel: raw.responsavel ?? '',
        cep: raw.cep ?? '',
        endereco: raw.endereco ?? '',
        cidade: raw.cidade ?? '',
        estado: uf,
        plan_id,
        unit_id,
        data_matricula: matricula || toISODate(),
        status,
        observacoes: raw.observacoes ?? '',
      },
    }
  })
  return { itens }
}

/** Importação de alunos por planilha CSV, com prévia e validação linha a linha */
export default function ImportarAlunos({ onClose }) {
  const { academyId } = useTenant()
  const queryClient = useQueryClient()
  const inputRef = useRef(null)
  const plans = useQuery({ queryKey: ['plans', academyId], queryFn: () => planService.list(academyId) })
  const units = useQuery({ queryKey: ['units', academyId], queryFn: () => unitService.list(academyId) })
  const usage = useQuery({ queryKey: ['students', academyId, 'usage'], queryFn: () => academyUsage(academyId) })

  const [arquivo, setArquivo] = useState('')
  const [analise, setAnalise] = useState(null)
  const [lendo, setLendo] = useState(false)
  const [progresso, setProgresso] = useState(null) // { feitos, total, ok, falhas: [] }

  const onFile = async (file) => {
    if (!file) return
    setLendo(true)
    try {
      const buf = await file.arrayBuffer()
      // Excel em pt-BR costuma salvar CSV em Windows-1252: se o UTF-8 falhar, tenta latin1
      let text = new TextDecoder('utf-8').decode(buf)
      if (text.includes('�')) text = new TextDecoder('windows-1252').decode(buf)
      const rows = parseCSV(text)
      setArquivo(file.name)
      if (rows.length < 2) setAnalise({ erroGeral: 'A planilha está vazia. Preencha a partir da 2ª linha (a 1ª é o cabeçalho).' })
      else {
        const cpfs = await listStudentCpfs(academyId)
        setAnalise(analisar(rows, { plans: plans.data ?? [], units: units.data ?? [], cpfs }))
      }
    } catch (err) {
      setAnalise({ erroGeral: errorMessage(err) })
    } finally {
      setLendo(false)
      if (inputRef.current) inputRef.current.value = ''
    }
  }

  const itens = analise?.itens ?? []
  const validos = itens.filter((i) => !i.erros.length && !i.jaExiste)
  const comErro = itens.filter((i) => i.erros.length)
  const existentes = itens.filter((i) => i.jaExiste)
  const ativosNovos = validos.filter((i) => i.values.status === 'ativo').length
  const vagas = usage.data?.limite ? usage.data.limite - usage.data.ativos : null

  const importar = async () => {
    const falhas = []
    let ok = 0
    setProgresso({ feitos: 0, total: validos.length, ok: 0, falhas })
    for (const [n, item] of validos.entries()) {
      try {
        await createStudent(academyId, item.values)
        ok++
      } catch (err) {
        falhas.push({ ...item, erros: [errorMessage(err)] })
      }
      setProgresso({ feitos: n + 1, total: validos.length, ok, falhas: [...falhas] })
    }
    queryClient.invalidateQueries({ queryKey: ['students', academyId] })
    queryClient.invalidateQueries({ queryKey: ['admin-dashboard', academyId] })
  }

  const baixarErros = (lista) =>
    exportCSV('alunos-com-erro', [
      { header: 'linha', value: (i) => i.linha },
      { header: 'nome', value: (i) => i.nome },
      { header: 'cpf', value: (i) => (i.cpf ? formatCPF(i.cpf) : '') },
      { header: 'problema', value: (i) => i.erros.join('; ') },
    ], lista)

  const terminado = progresso && progresso.feitos === progresso.total
  const importando = progresso && !terminado

  return (
    <Modal
      open
      onClose={importando ? () => {} : onClose}
      size="lg"
      title="Importar alunos por planilha"
      footer={
        terminado ? (
          <Button onClick={onClose}>Concluir</Button>
        ) : (
          <>
            <Button variant="outline" onClick={onClose} disabled={importando}>
              Cancelar
            </Button>
            {itens.length > 0 && (
              <Button icon={Upload} disabled={!validos.length} loading={importando} onClick={importar}>
                Importar {validos.length} aluno(s)
              </Button>
            )}
          </>
        )
      }
    >
      {progresso ? (
        <div className={styles.result}>
          <div className={styles.bar}>
            <span style={{ width: `${(progresso.feitos / Math.max(1, progresso.total)) * 100}%` }} />
          </div>
          <p>
            {terminado ? 'Importação concluída: ' : `Importando ${progresso.feitos} de ${progresso.total}… `}
            <strong>{progresso.ok}</strong> cadastrado(s)
            {progresso.falhas.length > 0 && <>, <strong>{progresso.falhas.length}</strong> com erro</>}.
          </p>
          {terminado && progresso.ok > 0 && (
            <p className="text-muted">A senha inicial de cada aluno é formada pelos 6 primeiros dígitos do CPF.</p>
          )}
          {progresso.falhas.length > 0 && (
            <>
              <ul className={styles.errors}>
                {progresso.falhas.slice(0, 50).map((f) => (
                  <li key={f.linha}>
                    Linha {f.linha} — {f.nome || 'sem nome'}: {f.erros.join('; ')}
                  </li>
                ))}
              </ul>
              {terminado && (
                <Button size="sm" variant="outline" icon={Download} onClick={() => baixarErros(progresso.falhas)}>
                  Baixar lista de erros
                </Button>
              )}
            </>
          )}
        </div>
      ) : (
        <>
          <ol className={styles.steps}>
            <li>
              Baixe a <strong>planilha modelo</strong> e preencha um aluno por linha, sem mudar o cabeçalho.{' '}
              <Button size="sm" variant="secondary" icon={Download} onClick={baixarModelo}>
                Baixar modelo (CSV)
              </Button>
            </li>
            <li>No Excel ou Google Planilhas, salve como <strong>CSV</strong>.</li>
            <li>Envie o arquivo: antes de importar, você vê a prévia com os erros de cada linha.</li>
          </ol>

          <details className={styles.columns}>
            <summary>Ver as colunas da planilha</summary>
            <table>
              <tbody>
                {COLUMNS.map((c) => (
                  <tr key={c.key}>
                    <td>
                      <code>{c.label}</code>
                      {c.required && <Badge tone="danger">obrigatório</Badge>}
                    </td>
                    <td className="text-muted">{c.help}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </details>

          <label className={styles.drop}>
            <input ref={inputRef} type="file" accept=".csv,text/csv" onChange={(e) => onFile(e.target.files?.[0])} disabled={lendo || plans.isPending || units.isPending} />
            <FileSpreadsheet size={28} />
            <strong>{lendo ? 'Lendo planilha…' : arquivo || 'Escolher arquivo CSV'}</strong>
            <small className="text-muted">{arquivo ? 'Clique para trocar o arquivo' : 'Separado por ponto e vírgula ou vírgula'}</small>
          </label>

          {analise?.erroGeral && (
            <p className={styles.alert}>
              <AlertTriangle size={16} /> {analise.erroGeral}
            </p>
          )}

          {itens.length > 0 && (
            <>
              <div className={styles.counts}>
                <span>
                  <CheckCircle2 size={16} color="var(--color-success)" /> <strong>{validos.length}</strong> prontos para importar
                </span>
                {existentes.length > 0 && (
                  <span>
                    <strong>{existentes.length}</strong> já cadastrados (ignorados)
                  </span>
                )}
                {comErro.length > 0 && (
                  <span>
                    <AlertTriangle size={16} color="var(--color-danger)" /> <strong>{comErro.length}</strong> com erro
                    <Button size="sm" variant="ghost" icon={Download} onClick={() => baixarErros(comErro)}>
                      Baixar
                    </Button>
                  </span>
                )}
              </div>
              {vagas !== null && ativosNovos > vagas && (
                <p className={styles.alert}>
                  <AlertTriangle size={16} /> Seu plano permite mais {Math.max(0, vagas)} aluno(s) ativo(s) e a planilha tem {ativosNovos}. Os que passarem do
                  limite não serão cadastrados — fale com o suporte para aumentar o plano.
                </p>
              )}
              <div className={styles.preview}>
                <table>
                  <thead>
                    <tr>
                      <th>Linha</th>
                      <th>Nome</th>
                      <th>CPF</th>
                      <th>Situação</th>
                    </tr>
                  </thead>
                  <tbody>
                    {itens.map((i) => (
                      <tr key={i.linha} className={i.erros.length ? styles.bad : ''}>
                        <td>{i.linha}</td>
                        <td>{i.nome || '—'}</td>
                        <td>{i.cpf ? formatCPF(i.cpf) : '—'}</td>
                        <td>
                          {i.erros.length ? (
                            <span className={styles.err}>{i.erros.join('; ')}</span>
                          ) : i.jaExiste ? (
                            <Badge tone="neutral">Já cadastrado</Badge>
                          ) : (
                            <Badge tone="success">OK</Badge>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </>
      )}
    </Modal>
  )
}
