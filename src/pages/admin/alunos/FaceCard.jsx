import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Camera, CheckCircle2, ImageUp, RefreshCw, ScanFace } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { Badge, Button, Card, Checkbox, Modal, Tabs, useToast } from '../../../components/ui'
import { useTenant } from '../../../hooks/useAuth'
import { usePermissions } from '../../../hooks/usePermissions'
import { cadastrarRosto, faceStatus } from '../../../services/catracaService'
import { errorMessage } from '../../../utils/errors'
import { formatDateTime } from '../../../utils/formatters'
import styles from './FaceCard.module.css'

const STATUS = {
  sem: { label: 'Sem rosto cadastrado', tone: 'neutral' },
  pendente: { label: 'Enviando para a catraca…', tone: 'warning' },
  ok: { label: 'Rosto cadastrado', tone: 'success' },
  erro: { label: 'Não cadastrado', tone: 'danger' },
}

/** Reduz a foto (no máximo 960 px, JPEG) para caber no limite de 2 MB do aparelho */
async function prepararFoto(source) {
  const img = source instanceof HTMLCanvasElement ? source : await createImageBitmap(source)
  const w = img.width
  const h = img.height
  if (Math.min(w, h) < 240) throw new Error('Foto muito pequena: use uma imagem maior')
  const scale = Math.min(1, 960 / Math.max(w, h))
  const canvas = document.createElement('canvas')
  canvas.width = Math.round(w * scale)
  canvas.height = Math.round(h * scale)
  canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height)
  const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.9))
  if (!blob) throw new Error('Não foi possível preparar a foto')
  return blob
}

/** Câmera do computador ou do celular, com moldura para o rosto */
function CameraCapture({ onCapture }) {
  const videoRef = useRef(null)
  const [erro, setErro] = useState('')
  const [pronto, setPronto] = useState(false)

  useEffect(() => {
    let stream
    let cancel = false
    navigator.mediaDevices
      ?.getUserMedia({ video: { facingMode: 'user', width: { ideal: 1280 }, height: { ideal: 960 } }, audio: false })
      .then((s) => {
        if (cancel) {
          s.getTracks().forEach((t) => t.stop())
          return
        }
        stream = s
        if (videoRef.current) {
          videoRef.current.srcObject = s
          videoRef.current.play().catch(() => {})
        }
        setPronto(true)
      })
      .catch((e) =>
        setErro(
          e?.name === 'NotAllowedError'
            ? 'A câmera foi bloqueada. Libere o acesso à câmera no navegador (ícone de cadeado na barra de endereço) ou use "Enviar foto".'
            : 'Nenhuma câmera disponível neste aparelho. Use "Enviar foto".',
        ),
      )
    if (!navigator.mediaDevices) setErro('Este navegador não permite usar a câmera. Use "Enviar foto".')
    return () => {
      cancel = true
      stream?.getTracks().forEach((t) => t.stop())
    }
  }, [])

  const capturar = () => {
    const v = videoRef.current
    if (!v?.videoWidth) return
    const canvas = document.createElement('canvas')
    canvas.width = v.videoWidth
    canvas.height = v.videoHeight
    const ctx = canvas.getContext('2d')
    // a imagem da câmera frontal aparece espelhada; a foto vai sem espelho
    ctx.drawImage(v, 0, 0)
    onCapture(canvas)
  }

  if (erro) return <p className={styles.erro}>{erro}</p>
  return (
    <div className={styles.camera}>
      <div className={styles.videoBox}>
        <video ref={videoRef} playsInline muted className={styles.video} />
        <div className={styles.moldura} aria-hidden />
      </div>
      <p className="text-muted" style={{ margin: '8px 0', fontSize: 13 }}>
        Rosto dentro da moldura, de frente, sem boné nem óculos escuros, em local bem iluminado.
      </p>
      <Button icon={Camera} onClick={capturar} disabled={!pronto} block>
        Tirar foto
      </Button>
    </div>
  )
}

function FaceModal({ student, onClose }) {
  const { academyId } = useTenant()
  const queryClient = useQueryClient()
  const toast = useToast()
  const [modo, setModo] = useState('camera')
  const [foto, setFoto] = useState(null) // { blob, url }
  const [consentimento, setConsentimento] = useState(false)
  const [enviando, setEnviando] = useState(false)
  const nome = student.profile?.nome ?? 'aluno'

  useEffect(() => () => foto?.url && URL.revokeObjectURL(foto.url), [foto])

  const usar = async (source) => {
    try {
      const blob = await prepararFoto(source)
      setFoto({ blob, url: URL.createObjectURL(blob) })
    } catch (err) {
      toast.error(errorMessage(err))
    }
  }

  const enviar = async () => {
    setEnviando(true)
    try {
      await cadastrarRosto(academyId, student.id, foto.blob)
      await queryClient.invalidateQueries({ queryKey: ['catraca-face', student.id] })
      toast.success('Foto enviada. A catraca confirma o cadastro em alguns segundos.')
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
      title={`Cadastrar rosto · ${nome}`}
      footer={
        foto && (
          <>
            <Button variant="outline" icon={RefreshCw} onClick={() => setFoto(null)}>
              Outra foto
            </Button>
            <Button icon={CheckCircle2} loading={enviando} disabled={!consentimento} onClick={enviar}>
              Enviar para a catraca
            </Button>
          </>
        )
      }
    >
      {foto ? (
        <div className={styles.preview}>
          <img src={foto.url} alt="Prévia da foto" />
          <Checkbox
            checked={consentimento}
            onChange={setConsentimento}
            label="O aluno (ou o responsável, se menor) autorizou o uso do rosto para entrar na academia."
          />
          <small className="text-muted">
            A foto serve só para o cadastro no aparelho e é apagada do sistema assim que a catraca confirma (LGPD).
          </small>
        </div>
      ) : (
        <>
          <Tabs
            items={[
              { key: 'camera', label: 'Tirar foto agora' },
              { key: 'upload', label: 'Enviar foto' },
            ]}
            value={modo}
            onChange={setModo}
          />
          {modo === 'camera' ? (
            <CameraCapture onCapture={usar} />
          ) : (
            <label className={styles.upload}>
              <input type="file" accept="image/jpeg,image/png" onChange={(e) => e.target.files?.[0] && usar(e.target.files[0])} />
              <ImageUp size={28} />
              <strong>Escolher foto (JPG ou PNG)</strong>
              <small className="text-muted">Foto de frente, só o rosto, com boa luz</small>
            </label>
          )}
        </>
      )}
    </Modal>
  )
}

/** Card da ficha do aluno: reconhecimento facial na catraca */
export default function FaceCard({ student }) {
  const { can } = usePermissions()
  const [open, setOpen] = useState(false)
  const q = useQuery({
    queryKey: ['catraca-face', student.id],
    queryFn: () => faceStatus(student.id),
    // enquanto a catraca não confirma, confere a cada 4 segundos
    refetchInterval: (query) => (query.state.data?.face_status === 'pendente' ? 4000 : false),
  })
  const s = q.data?.face_status ?? 'sem'
  const info = STATUS[s]

  return (
    <Card
      title={
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
          <ScanFace size={18} /> Reconhecimento facial
        </span>
      }
    >
      <p style={{ margin: '0 0 8px' }}>
        <Badge tone={info.tone}>{info.label}</Badge>
      </p>
      {s === 'erro' && q.data?.face_erro && <p className={styles.erro}>{q.data.face_erro}</p>}
      {s === 'ok' && q.data?.face_em && <p className="text-muted" style={{ fontSize: 13 }}>Cadastrado em {formatDateTime(q.data.face_em)}</p>}
      {can('catraca.biometria') && (
        <Button size="sm" variant={s === 'ok' ? 'outline' : 'primary'} icon={Camera} onClick={() => setOpen(true)}>
          {s === 'ok' ? 'Trocar foto do rosto' : 'Cadastrar rosto'}
        </Button>
      )}
      {open && <FaceModal student={student} onClose={() => setOpen(false)} />}
    </Card>
  )
}
