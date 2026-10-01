/**
 * Identifica o tipo de vídeo de um exercício.
 * @param {string|null|undefined} url
 * @returns {{ type: 'youtube'|'vimeo'|'file'|'link', src: string } | null}
 */
export function parseVideo(url) {
  if (!url) return null
  let u
  try {
    u = new URL(url)
  } catch {
    return null
  }
  const host = u.hostname.replace(/^www\.|^m\./, '')

  if (host === 'youtu.be' || host.endsWith('youtube.com') || host === 'youtube-nocookie.com') {
    const id =
      host === 'youtu.be'
        ? u.pathname.slice(1)
        : u.searchParams.get('v') ?? u.pathname.match(/\/(?:embed|shorts|live|v)\/([\w-]{6,})/)?.[1]
    if (id && /^[\w-]{6,}$/.test(id)) return { type: 'youtube', src: `https://www.youtube-nocookie.com/embed/${id}?rel=0` }
  }
  if (host === 'vimeo.com' || host === 'player.vimeo.com') {
    const id = u.pathname.match(/(\d{6,})/)?.[1]
    if (id) return { type: 'vimeo', src: `https://player.vimeo.com/video/${id}` }
  }
  if (/\.(mp4|webm|mov|m4v)$/i.test(u.pathname) || u.pathname.includes('/exercise-videos/')) {
    return { type: 'file', src: url }
  }
  return { type: 'link', src: url }
}

export const VIDEO_MAX_MB = 50
export const VIDEO_TYPES = /^video\/(mp4|webm|quicktime)$/
