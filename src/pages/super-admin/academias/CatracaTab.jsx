import { useQuery } from '@tanstack/react-query'
import { AlertTriangle, Copy, Eye, KeyRound, Pencil, Plus, Power, RefreshCw, ScanFace, Trash2, Wrench } from 'lucide-react'
import { useState } from 'react'
import {
  Badge,
  Button,
  Card,
  Checkbox,
  EmptyState,
  FormGrid,
  FullRow,
  Input,
  Modal,
  Select,
  SkeletonCard,
  Textarea,
  useConfirm,
  useToast,
} from '../../../components/ui'
import { useMutationToast } from '../../../hooks/useMutationToast'
import { useSuperRole } from '../../../hooks/useSuperRole'
import { unitService } from '../../../services/catalogServices'
import {
  catracaUrl,
  excluirCatraca,
  isOnline,
  listCatracas,
  listComandos,
  novoTokenCatraca,
  saveCatraca,
  setCatracaAtiva,
  sincronizarCatraca,
  verSenhaCatraca,
} from '../../../services/catracaService'
import { academyModules } from '../../../services/moduleService'
import { errorMessage } from '../../../utils/errors'
import { formatDateTime } from '../../../utils/formatters'
import styles from './CatracaTab.module.css'

const SENTIDOS = [
  { value: 'entrada', label: 'Entrada (gera check-in)' },
  { value: 'saida', label: 'Saída (não gera check-in)' },
  { value: 'ambos', label: 'Entrada e saída' },
]
const MODELOS = [
  'iDBlock Next + iDFace',
  'iDBlock Next (display integrado)',
  'iDBlock Next + leitor biométrico',
  'iDBlock',
  'iDFace (porta)',
  'iDFace Max',
  'iDAccess (biometria)',
  'iDFlex (biometria)',
  'Outro',
]
const METODOS = [
  { value: 'facial', label: 'Reconhecimento facial' },
  { value: 'digital', label: 'Biometria (digital)' },
  { value: 'cartao', label: 'Cartão de proximidade' },
  { value: 'senha', label: 'Senha' },
  { value: 'qrcode', label: 'QR Code' },
]
const LIGACOES = [
  { value: 'idface_primario_mae', label: 'iDFace primário do conjunto iDBlock Next (via MAE)' },
  { value: 'leitor_integrado', label: 'Leitor integrado à catraca' },
  { value: 'leitor_separado', label: 'Leitor separado ligado por relé' },
  { value: 'outro', label: 'Outro' },
]
const ACOES = [
  { value: 'catra', label: 'Girar a catraca (catra)' },
  { value: 'sec_box', label: 'Acionar relé do módulo externo (sec_box)' },
]
const DIRECOES = [
  { value: 'clockwise', label: 'Horário' },
  { value: 'anticlockwise', label: 'Anti-horário' },
  { value: 'both', label: 'Os dois sentidos' },
]
const COMANDO = { usuario: 'Cadastrar aluno', rosto: 'Cadastrar rosto', digital: 'Cadastrar digital', liberar: 'Liberar giro', remover: 'Remover aluno', config: 'Configuração' }

const EMPTY = {
  nome: '',
  unit_id: '',
  sentido: 'entrada',
  modelo: 'iDBlock Next + iDFace',
  leitor: 'iDFace Facial',
  metodos: ['facial'],
  numero_serie: '',
  firmware: '',
  hw_device_id: '',
  ip_interno: '',
  painel_usuario: 'admin',
  ligacao: 'idface_primario_mae',
  outro_sistema: false,
  rostos_existentes: false,
  observacoes: '',
  acao_liberar: 'catra',
  direcao: 'clockwise',
}

/** Copia para a área de transferência com aviso */
function useCopy() {
  const toast = useToast()
  return async (text, label = 'Copiado') => {
    try {
      await navigator.clipboard.writeText(text)
      toast.success(label)
    } catch {
      toast.error('Não foi possível copiar; selecione o texto e copie manualmente')
    }
  }
}

/** Cadastro / edição do equipamento (dados da seção 5.1 do planejamento) */
function CatracaForm({ academyId, device, onClose, onCreated }) {
  const [v, setV] = useState(() => (device ? { ...EMPTY, ...Object.fromEntries(Object.entries(device).map(([k, x]) => [k, x ?? EMPTY[k] ?? ''])) } : EMPTY))
  const [senha, setSenha] = useState('')
  const units = useQuery({ queryKey: ['units', academyId], queryFn: () => unitService.list(academyId) })
  const set = (k) => (e) => setV((p) => ({ ...p, [k]: e?.target ? e.target.value : e }))
  const save = useMutationToast(
    () => saveCatraca(device?.id, academyId, { ...v, metodos: v.metodos }, senha === '' ? null : senha),
    {
      success: device ? 'Catraca atualizada' : 'Catraca cadastrada',
      invalidate: [['catracas', academyId], ['catraca-equipamentos']],
      onSuccess: (r) => (device ? onClose() : onCreated(r)),
    },
  )
  const toggleMetodo = (m, on) => setV((p) => ({ ...p, metodos: on ? [...new Set([...p.metodos, m])] : p.metodos.filter((x) => x !== m) }))

  return (
    <Modal
      open
      onClose={onClose}
      size="lg"
      title={device ? `Editar ${device.nome}` : 'Adicionar catraca'}
      footer={
        <>
          <Button variant="outline" onClick={onClose}>
            Cancelar
          </Button>
          <Button onClick={() => save.mutate()} loading={save.isPending} disabled={!v.nome.trim()}>
            {device ? 'Salvar' : 'Cadastrar e gerar código'}
          </Button>
        </>
      }
    >
      <FormGrid columns={2}>
        <Input label="Nome" required placeholder="Ex.: Entrada principal" value={v.nome} onChange={set('nome')} />
        <Select
          label="Unidade"
          placeholder="—"
          options={(units.data ?? []).map((u) => ({ value: u.id, label: u.nome }))}
          value={v.unit_id ?? ''}
          onChange={set('unit_id')}
        />
        <Select label="Sentido" options={SENTIDOS} value={v.sentido} onChange={set('sentido')} />
        <Select label="Modelo" options={MODELOS.map((m) => ({ value: m, label: m }))} value={v.modelo} onChange={set('modelo')} />
        <Input label="Leitor / dispositivo" placeholder="Ex.: iDFace Facial" value={v.leitor} onChange={set('leitor')} />
        <Select label="Como o leitor está ligado" options={LIGACOES} value={v.ligacao} onChange={set('ligacao')} />
        <Input label="Número de série" placeholder="Ex.: 0M0200/03315D" value={v.numero_serie} onChange={set('numero_serie')} />
        <Input label="Firmware" placeholder="Ex.: 6.24.7 (preenchido sozinho na conexão)" value={v.firmware} onChange={set('firmware')} />
        <Input label="ID do dispositivo" placeholder="Informado pelo aparelho" value={v.hw_device_id} onChange={set('hw_device_id')} />
        <Input label="IP interno" placeholder="Ex.: 192.168.0.50" value={v.ip_interno} onChange={set('ip_interno')} />
        <Input label="Usuário do painel web" value={v.painel_usuario} onChange={set('painel_usuario')} />
        <Input
          label="Senha do painel web"
          type="password"
          autoComplete="new-password"
          placeholder={device ? 'Deixe vazio para manter a atual' : ''}
          hint="Guardada criptografada; só o Super Admin vê"
          value={senha}
          onChange={(e) => setSenha(e.target.value)}
        />
        <FullRow>
          <span className={styles.label}>Métodos de identificação</span>
          <div className={styles.checks}>
            {METODOS.map((m) => (
              <Checkbox key={m.value} label={m.label} checked={v.metodos.includes(m.value)} onChange={(on) => toggleMetodo(m.value, on)} />
            ))}
          </div>
        </FullRow>
        <Select label="Ação para liberar" options={ACOES} value={v.acao_liberar} onChange={set('acao_liberar')} hint="Padrão: girar a catraca" />
        <Select label="Sentido do giro liberado" options={DIRECOES} value={v.direcao} onChange={set('direcao')} />
        <FullRow>
          <div className={styles.checks}>
            <Checkbox label="Já havia outro sistema controlando a catraca" checked={Boolean(v.outro_sistema)} onChange={(on) => setV((p) => ({ ...p, outro_sistema: on }))} />
            <Checkbox label="Os rostos dos alunos já estão cadastrados no leitor" checked={Boolean(v.rostos_existentes)} onChange={(on) => setV((p) => ({ ...p, rostos_existentes: on }))} />
          </div>
        </FullRow>
        <FullRow>
          <Textarea label="Observações da equipe de TI" rows={2} value={v.observacoes} onChange={set('observacoes')} />
        </FullRow>
      </FormGrid>
    </Modal>
  )
}

/** Script do PowerShell que configura o iDFace pela API (modo online + push com o endereço completo) */
const scriptPowerShell = ({ ip, usuario, url }) => `$IP    = "${ip}"
$SENHA = "SENHA_DO_PAINEL"
$URL   = "${url}"

$s = (Invoke-RestMethod -Method Post -Uri "http://$IP/login.fcgi" -ContentType "application/json" \`
      -Body (@{ login = "${usuario}"; password = $SENHA } | ConvertTo-Json)).session
$srv = Invoke-RestMethod -Method Post -Uri "http://$IP/create_objects.fcgi?session=$s" -ContentType "application/json" \`
      -Body (@{ object = "devices"; values = @(@{ name = "SaaS Academia"; ip = $URL; public_key = "" }) } | ConvertTo-Json -Depth 5)
$id = $srv.ids[0]
$cfg = @{
  online_client = @{ server_id = "$id"; extract_template = "0"; max_request_attempts = "3"; request_timeout = "5000" }
  general       = @{ online = "1" }
  push_server   = @{ push_remote_address = $URL; push_request_timeout = "15000"; push_request_period = "5" }
} | ConvertTo-Json -Depth 5
Invoke-RestMethod -Method Post -Uri "http://$IP/set_configuration.fcgi?session=$s" -ContentType "application/json" -Body $cfg
"Pronto! Servidor $id configurado."`

/** Endereço + passo a passo para configurar o aparelho (token aparece uma vez) */
function TokenModal({ device, token, onClose }) {
  const copy = useCopy()
  const url = catracaUrl(token)
  const ip = device?.ip_interno || 'IP_DA_CATRACA'
  const usuario = device?.painel_usuario || 'admin'
  const script = scriptPowerShell({ ip, usuario, url })
  const desfazer = `$IP = "${ip}"; $SENHA = "SENHA_DO_PAINEL"
$s = (Invoke-RestMethod -Method Post -Uri "http://$IP/login.fcgi" -ContentType "application/json" -Body (@{ login = "${usuario}"; password = $SENHA } | ConvertTo-Json)).session
Invoke-RestMethod -Method Post -Uri "http://$IP/set_configuration.fcgi?session=$s" -ContentType "application/json" -Body '{"general":{"online":"0"}}'`

  return (
    <Modal open onClose={onClose} size="lg" title="Configurar o aparelho" footer={<Button onClick={onClose}>Já anotei</Button>}>
      <p className={styles.warn}>
        <AlertTriangle size={16} /> O endereço contém o <b>código secreto</b> da catraca e aparece só agora. Guarde o script; se perder, gere um novo código.
      </p>

      <span className={styles.label}>Endereço do servidor (modo online e push)</span>
      <div className={styles.copyRow}>
        <code>{url}</code>
        <Button size="sm" variant="outline" icon={Copy} onClick={() => copy(url, 'Endereço copiado')}>
          Copiar
        </Button>
      </div>

      <span className={styles.label}>Como configurar (pelo PowerShell, na rede da academia)</span>
      <ol className={styles.steps}>
        <li>
          Num computador Windows <b>na mesma rede da catraca</b>, abra o <b>PowerShell</b>.
        </li>
        <li>
          Copie o script abaixo e troque <b>SENHA_DO_PAINEL</b> pela senha do painel web
          {device?.ip_interno ? '' : <> e <b>IP_DA_CATRACA</b> pelo IP do iDFace (na tela: MENU → CONFIGURAÇÕES → REDE)</>}.
        </li>
        <li>
          Cole no PowerShell e aperte Enter. Deve aparecer <b>"Pronto! Servidor … configurado."</b>
        </li>
        <li>
          Volte aqui: em até ~10 segundos o status muda para <b>Online</b>. Depois clique em <b>Enviar alunos</b>.
        </li>
      </ol>
      <div className={styles.copyRow}>
        <pre className={styles.pre}>{script}</pre>
        <Button size="sm" variant="outline" icon={Copy} onClick={() => copy(script, 'Script copiado')}>
          Copiar
        </Button>
      </div>
      <p className="text-muted" style={{ fontSize: 13, margin: '4px 0 12px' }}>
        O painel web do iDFace não tem campo para um endereço completo como este; por isso a configuração é feita pela API do aparelho. Não mexa no papel
        primário/secundário do conjunto iDBlock (apaga os cadastros do aparelho).
      </p>

      <details>
        <summary className={styles.toggle}>Desfazer (voltar a catraca a funcionar sozinha)</summary>
        <div className={styles.copyRow} style={{ marginTop: 8 }}>
          <pre className={styles.pre}>{desfazer}</pre>
          <Button size="sm" variant="outline" icon={Copy} onClick={() => copy(desfazer, 'Script copiado')}>
            Copiar
          </Button>
        </div>
      </details>
    </Modal>
  )
}

/** Últimos comandos da fila (suporte) */
function Comandos({ deviceId }) {
  const q = useQuery({ queryKey: ['catraca-comandos', deviceId], queryFn: () => listComandos(deviceId), refetchInterval: 10000 })
  if (q.isPending) return <p className="text-muted">Carregando…</p>
  if (!q.data?.length) return <p className="text-muted">Nenhum comando enviado ainda.</p>
  return (
    <table className={styles.table}>
      <thead>
        <tr>
          <th>Comando</th>
          <th>Situação</th>
          <th>Quando</th>
          <th>Resposta</th>
        </tr>
      </thead>
      <tbody>
        {q.data.map((c) => (
          <tr key={c.id}>
            <td>{COMANDO[c.tipo] ?? c.tipo}</td>
            <td>
              <Badge tone={c.status === 'ok' ? 'success' : c.status === 'erro' ? 'danger' : 'warning'}>
                {{ pendente: 'Na fila', enviado: 'Enviado', ok: 'Concluído', erro: 'Erro' }[c.status]}
              </Badge>
            </td>
            <td>{formatDateTime(c.concluido_em ?? c.created_at)}</td>
            <td className={styles.resposta} title={c.resposta ?? ''}>
              {c.resposta || '—'}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}

function StatusBadge({ d }) {
  if (!d.ativo) return <Badge tone="neutral">Desativada</Badge>
  if (isOnline(d.ultimo_sinal)) return <Badge tone="success">Online</Badge>
  return <Badge tone="danger">{d.ultimo_sinal ? 'Offline' : 'Aguardando conexão'}</Badge>
}

/** Aba "Catraca" da academia (somente Super Admin) */
export default function CatracaTab({ academyId }) {
  const { superCan } = useSuperRole()
  const pode = superCan('academias')
  const toast = useToast()
  const [confirm, confirmDialog] = useConfirm()
  const [form, setForm] = useState(null) // { device? }
  const [token, setToken] = useState(null) // { device, token }
  const [aberto, setAberto] = useState(null)

  const devices = useQuery({ queryKey: ['catracas', academyId], queryFn: () => listCatracas(academyId), refetchInterval: 15000 })
  const modulos = useQuery({ queryKey: ['academy-modules', academyId], queryFn: () => academyModules(academyId) })
  const invalidate = [['catracas', academyId], ['catraca-equipamentos']]
  const ativo = useMutationToast(({ id, on }) => setCatracaAtiva(id, on), { success: 'Situação atualizada', invalidate })
  const excluir = useMutationToast(excluirCatraca, { success: 'Catraca excluída', invalidate })
  const sync = useMutationToast(sincronizarCatraca, { success: (n) => `${n} aluno(s) enviados para a catraca`, invalidate: [['catraca-comandos']] })

  const verSenha = async (d) => {
    try {
      const s = await verSenhaCatraca(d.id)
      await confirm({ title: `Senha do painel · ${d.nome}`, message: s ? `Usuário: ${d.painel_usuario ?? '—'}  ·  Senha: ${s}` : 'Nenhuma senha cadastrada.', confirmLabel: 'Fechar' })
    } catch (err) {
      toast.error(errorMessage(err))
    }
  }
  const gerarToken = async (d) => {
    if (!(await confirm({ title: 'Gerar novo código', message: `O código atual de "${d.nome}" para de funcionar na hora. Será preciso configurar o novo endereço no aparelho.`, danger: true, confirmLabel: 'Gerar' }))) return
    try {
      setToken({ device: d, token: await novoTokenCatraca(d.id) })
    } catch (err) {
      toast.error(errorMessage(err))
    }
  }

  const semModulo = modulos.data && !modulos.data.includes('catraca')

  return (
    <>
      {confirmDialog}
      {semModulo && (
        <p className={styles.warn}>
          <AlertTriangle size={16} /> O adicional <b>Catraca</b> não está ligado para esta academia. Ligue na aba <b>Módulos</b>; sem ele a catraca bloqueia todos.
        </p>
      )}
      <Card
        title="Catracas"
        subtitle="Equipamentos da academia. Só a equipe do SaaS vê e configura."
        actions={pode && <Button icon={Plus} onClick={() => setForm({})}>Adicionar catraca</Button>}
      >
        {devices.isPending ? (
          <SkeletonCard lines={3} />
        ) : !devices.data?.length ? (
          <EmptyState compact icon={ScanFace} title="Nenhuma catraca cadastrada" description="Adicione a catraca para gerar o endereço que vai no aparelho." />
        ) : (
          <div className={styles.list}>
            {devices.data.map((d) => (
              <div key={d.id} className={styles.device}>
                <div className={styles.head}>
                  <div>
                    <strong>{d.nome}</strong> <StatusBadge d={d} />
                    <small className="text-muted" style={{ display: 'block' }}>
                      {[SENTIDOS.find((s) => s.value === d.sentido)?.label, d.modelo, d.firmware && `firmware ${d.firmware}`].filter(Boolean).join(' · ')}
                    </small>
                  </div>
                  {pode && (
                    <div className={styles.actions}>
                      <Button size="sm" variant="ghost" icon={Pencil} onClick={() => setForm({ device: d })}>
                        Editar
                      </Button>
                      <Button size="sm" variant="ghost" icon={Wrench} onClick={() => gerarToken(d)}>
                        Configurar aparelho
                      </Button>
                      <Button size="sm" variant="ghost" icon={Eye} onClick={() => verSenha(d)}>
                        Senha
                      </Button>
                      <Button size="sm" variant="ghost" icon={RefreshCw} loading={sync.isPending && sync.variables === d.id} onClick={() => sync.mutate(d.id)}>
                        Enviar alunos
                      </Button>
                      <Button size="sm" variant="ghost" icon={Power} onClick={() => ativo.mutate({ id: d.id, on: !d.ativo })}>
                        {d.ativo ? 'Desativar' : 'Ativar'}
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        icon={Trash2}
                        aria-label="Excluir"
                        onClick={async () => {
                          if (await confirm({ title: 'Excluir catraca', message: `"${d.nome}" deixa de ser atendida pelo sistema.`, danger: true, confirmLabel: 'Excluir' })) excluir.mutate(d.id)
                        }}
                      />
                    </div>
                  )}
                </div>
                <dl className={styles.info}>
                  <div><dt>Número de série</dt><dd>{d.numero_serie || '—'}</dd></div>
                  <div><dt>ID do dispositivo</dt><dd>{d.hw_device_id || '—'}</dd></div>
                  <div><dt>IP interno</dt><dd>{d.ip_interno || '—'}</dd></div>
                  <div><dt>Código</dt><dd><KeyRound size={12} /> {d.token_inicio}…</dd></div>
                  <div><dt>Último sinal</dt><dd>{d.ultimo_sinal ? formatDateTime(d.ultimo_sinal) : 'nunca'}</dd></div>
                  <div><dt>Métodos</dt><dd>{(d.metodos ?? []).map((m) => METODOS.find((x) => x.value === m)?.label ?? m).join(', ') || '—'}</dd></div>
                </dl>
                {d.observacoes && <p className="text-muted" style={{ margin: '4px 0 0', fontSize: 13 }}>{d.observacoes}</p>}
                <button type="button" className={styles.toggle} onClick={() => setAberto(aberto === d.id ? null : d.id)}>
                  {aberto === d.id ? 'Ocultar comandos' : 'Ver últimos comandos enviados'}
                </button>
                {aberto === d.id && <Comandos deviceId={d.id} />}
              </div>
            ))}
          </div>
        )}
      </Card>

      {form && (
        <CatracaForm
          academyId={academyId}
          device={form.device}
          onClose={() => setForm(null)}
          onCreated={(r) => {
            setForm(null)
            setToken({ device: devices.data?.find((x) => x.id === r.id) ?? null, token: r.token })
          }}
        />
      )}
      {token && <TokenModal device={token.device} token={token.token} onClose={() => setToken(null)} />}
    </>
  )
}
