import { ExternalLink } from 'lucide-react'
import Modal from '../ui/Modal'
import { parseVideo } from '../../utils/video'
import styles from './VideoPlayer.module.css'

/**
 * Player de vídeo de exercício: YouTube/Vimeo (embed), arquivo enviado (<video>) ou link externo.
 * @param {{ url: string, title?: string }} props
 */
export default function VideoPlayer({ url, title = 'Vídeo do exercício' }) {
  const video = parseVideo(url)
  if (!video) return null

  if (video.type === 'link') {
    return (
      <a href={video.src} target="_blank" rel="noreferrer" className={styles.link}>
        <ExternalLink size={16} /> Abrir vídeo
      </a>
    )
  }
  return (
    <div className={styles.frame}>
      {video.type === 'file' ? (
        <video src={video.src} controls playsInline preload="metadata" title={title} />
      ) : (
        <iframe
          src={video.src}
          title={title}
          loading="lazy"
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; fullscreen"
          allowFullScreen
          referrerPolicy="strict-origin-when-cross-origin"
        />
      )}
    </div>
  )
}

/** Vídeo em modal (lista de exercícios / treino do aluno) */
export function VideoModal({ url, title, onClose }) {
  return (
    <Modal open={Boolean(url)} onClose={onClose} title={title} size="lg">
      {url && <VideoPlayer url={url} title={title} />}
    </Modal>
  )
}
