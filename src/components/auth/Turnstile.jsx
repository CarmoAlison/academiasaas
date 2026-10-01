import { useEffect, useImperativeHandle, useRef } from 'react'
import { useTheme } from '../../hooks/useTheme'

/** Chave pública do Cloudflare Turnstile. Sem ela, o CAPTCHA fica desligado. */
export const TURNSTILE_SITE_KEY = import.meta.env.VITE_TURNSTILE_SITE_KEY || ''

const SCRIPT_SRC = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit'
let scriptPromise = null

function loadScript() {
  if (window.turnstile) return Promise.resolve(window.turnstile)
  scriptPromise ??= new Promise((resolve, reject) => {
    const s = document.createElement('script')
    s.src = SCRIPT_SRC
    s.async = true
    s.onload = () => resolve(window.turnstile)
    s.onerror = () => {
      scriptPromise = null
      reject(new Error('Não foi possível carregar a verificação de segurança'))
    }
    document.head.appendChild(s)
  })
  return scriptPromise
}

/**
 * CAPTCHA do Cloudflare Turnstile (gratuito). O token vai junto no login e é
 * validado pelo próprio Supabase Auth (Authentication → Attack Protection → CAPTCHA).
 * @param {{ onToken: (token: string|null) => void, ref?: any }} props  ref.reset() gera um novo desafio
 */
export default function Turnstile({ onToken, ref }) {
  const container = useRef(null)
  const widgetId = useRef(null)
  const { resolved } = useTheme()
  const onTokenRef = useRef(onToken)
  useEffect(() => {
    onTokenRef.current = onToken
  })

  useImperativeHandle(ref, () => ({
    reset: () => {
      if (widgetId.current != null) window.turnstile?.reset(widgetId.current)
      onTokenRef.current?.(null)
    },
  }))

  useEffect(() => {
    if (!TURNSTILE_SITE_KEY) return
    let cancelled = false
    loadScript()
      .then((turnstile) => {
        if (cancelled || !container.current) return
        widgetId.current = turnstile.render(container.current, {
          sitekey: TURNSTILE_SITE_KEY,
          theme: resolved,
          language: 'pt-br',
          callback: (token) => onTokenRef.current?.(token),
          'expired-callback': () => onTokenRef.current?.(null),
          'error-callback': () => onTokenRef.current?.(null),
        })
      })
      .catch(() => onTokenRef.current?.(null))
    return () => {
      cancelled = true
      if (widgetId.current != null) window.turnstile?.remove(widgetId.current)
      widgetId.current = null
    }
  }, [resolved])

  if (!TURNSTILE_SITE_KEY) return null
  return <div ref={container} style={{ minHeight: 65 }} />
}
