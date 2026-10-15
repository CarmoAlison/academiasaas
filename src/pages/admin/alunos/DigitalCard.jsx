import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Fingerprint } from 'lucide-react'
import { useState } from 'react'
import { Badge, Button, Card, Checkbox, Modal, Select, useToast } from '../../../components/ui'
import { usePermissions } from '../../../hooks/usePermissions'
import { cadastrarDigital, faceStatus } from '../../../services/catracaService'
import { errorMessage } from '../../../utils/errors'
import { formatDateTime } from '../../../utils/formatters'
import styles from './FaceCard.module.css'

const STATUS = {
  sem: { label: 'Sem digital cadastrada', tone: 'neutral' },
  pendente: { label: 'Aguardando o dedo no leitor…', tone: 'warning' },
  ok: { label: 'Digital cadastrada', tone: 'success' },
  erro: { label: 'Não cadastrada', tone: 'danger' },
}

const rotulo = (c) => (c.unidade ? `${c.nome} · ${c.unidade}` : c.nome)

function DigitalModal({ student, catracas, onClose }) {
  const queryClient = useQueryClient()
  const toast = useToast()
  const [device, setDevice] = useState(catracas[0]?.id ?? '')
  const [consentimento, setConsentimento] = useState(false)
  const [enviando, setEnviando] = useState(false)
  const nome = student.profile?.nome ?? 'aluno'
  const catraca = catracas.find((c) => c.id === device)

  const iniciar = async () => {
    setEnviando(true)
    try {
      await cadastrarDigital(student.id, device)
      await queryClient.invalidateQueries({ queryKey: ['catraca-face', student.id] })
      toast.success(`Pronto: em alguns segundos a catraca "${catraca?.nome}" pede o dedo do aluno.`)
      onClose()
    } catch (err) {
      toast.error(errorMessage(err))
    } finally {
      setEnviando(false)
    }
  }

  return (
    <Modal
      open
      onClose={onClose}
      size="sm"
      title={`Cadastrar digital · ${nome}`}
      footer={
        <>
          <Button variant="outline" onClick={onClose}>
            Cancelar
          </Button>
          <Button icon={Fingerprint} loading={enviando} disabled={!device || !consentimento} onClick={iniciar}>
            Iniciar cadastro
          </Button>
        </>
      }
    >
      {catracas.length > 1 && (
        <div style={{ marginBottom: 12 }}>
          <Select label="Catraca onde o aluno vai pôr o dedo" options={catracas.map((c) => ({ value: c.id, label: rotulo(c) }))} value={device} onChange={(e) => setDevice(e.target.value)} />
        </div>
      )}
      <ol style={{ margin: '0 0 12px', paddingLeft: 20, display: 'grid', gap: 4, fontSize: 14 }}>
        <li>Leve o aluno até a catraca{catracas.length === 1 && catraca ? ` "${catraca.nome}"` : ''}.</li>
        <li>Clique em "Iniciar cadastro": a catraca pede o dedo em alguns segundos.</li>
        <li>O aluno põe o mesmo dedo no leitor, quantas vezes a catraca pedir (geralmente 3).</li>
      </ol>
      <Checkbox
        checked={consentimento}
        onChange={setConsentimento}
        label="O aluno (ou o responsável, se menor) autorizou o uso da digital para entrar na academia."
      />
      <small className="text-muted" style={{ display: 'block', marginTop: 8 }}>
        A digital fica guardada só na catraca — o sistema não armazena a digital (LGPD).
        {catracas.length > 1 && ' Ela vale só na catraca escolhida; para usar em outra, cadastre lá também.'}
      </small>
    </Modal>
  )
}

/** Card da ficha do aluno: impressão digital na catraca */
export default function DigitalCard({ student, catracas }) {
  const { can } = usePermissions()
  const [open, setOpen] = useState(false)
  const q = useQuery({
    queryKey: ['catraca-face', student.id],
    queryFn: () => faceStatus(student.id),
    // enquanto a catraca não confirma, confere a cada 4 segundos
    refetchInterval: (query) => (query.state.data?.digital_status === 'pendente' || query.state.data?.face_status === 'pendente' ? 4000 : false),
  })
  const s = q.data?.digital_status ?? 'sem'
  const info = STATUS[s]
  const onde = catracas.length > 1 ? catracas.find((c) => c.id === q.data?.digital_device) : null

  return (
    <Card
      title={
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
          <Fingerprint size={18} /> Digital
        </span>
      }
    >
      <p style={{ margin: '0 0 8px' }}>
        <Badge tone={info.tone}>{info.label}</Badge>
      </p>
      {s === 'erro' && q.data?.digital_erro && <p className={styles.erro}>{q.data.digital_erro}</p>}
      {s === 'ok' && q.data?.digital_em && (
        <p className="text-muted" style={{ fontSize: 13 }}>
          Cadastrada em {formatDateTime(q.data.digital_em)}
          {onde ? ` · ${onde.nome}` : ''}
        </p>
      )}
      {can('catraca.biometria') && s !== 'pendente' && (
        <Button size="sm" variant={s === 'ok' ? 'outline' : 'primary'} icon={Fingerprint} onClick={() => setOpen(true)}>
          {s === 'ok' ? 'Cadastrar de novo' : 'Cadastrar digital'}
        </Button>
      )}
      {open && <DigitalModal student={student} catracas={catracas} onClose={() => setOpen(false)} />}
    </Card>
  )
}
