const toRgb = (hex) => {
  const h = hex.replace('#', '')
  return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16))
}

const toHex = (rgb) => `#${rgb.map((v) => Math.round(v).toString(16).padStart(2, '0')).join('')}`

/** Mistura a cor com branco (amount 0–1 = quanto de branco) */
export function tint(hex, amount) {
  return toHex(toRgb(hex).map((v) => v + (255 - v) * amount))
}

/** Escurece a cor (amount 0–1) */
export function shade(hex, amount) {
  return toHex(toRgb(hex).map((v) => v * (1 - amount)))
}

/** Luminância relativa (WCAG) */
function luminance(hex) {
  const [r, g, b] = toRgb(hex).map((v) => {
    const c = v / 255
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
  })
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}

/** Texto legível (branco ou quase preto) sobre a cor informada */
export function readableOn(hex) {
  const l = luminance(hex)
  const contrastWhite = 1.05 / (l + 0.05)
  const contrastDark = (l + 0.05) / 0.05 // vs #111
  return contrastWhite >= 3 || contrastWhite >= contrastDark ? '#FFFFFF' : '#111111'
}

export const isHexColor = (v) => /^#[0-9A-Fa-f]{6}$/.test(v || '')

/** Mistura duas cores (amount 0–1 = quanto da segunda) */
export function mix(hexA, hexB, amount) {
  const a = toRgb(hexA)
  const b = toRgb(hexB)
  return toHex(a.map((v, i) => v + (b[i] - v) * amount))
}

/**
 * Variáveis CSS da cor da academia para o tema claro/escuro
 * (mesmos nomes de variables.css).
 */
export function brandVars(hex, dark) {
  if (dark) {
    const base = luminance(hex) < 0.08 ? tint(hex, 0.25) : hex // cor muito escura some no fundo escuro
    return {
      '--color-primary': base,
      '--color-primary-hover': tint(base, 0.12),
      '--color-primary-dark': tint(base, 0.55),
      '--color-primary-light': mix('#121A23', base, 0.22),
      '--color-on-primary': readableOn(base),
      '--color-secondary-hover': mix('#121A23', base, 0.32),
      '--gradient-brand': `linear-gradient(145deg, ${hex} 0%, ${shade(hex, 0.2)} 100%)`,
    }
  }
  return {
    '--color-primary': hex,
    '--color-primary-hover': shade(hex, 0.2),
    '--color-primary-dark': shade(hex, 0.25),
    '--color-primary-light': tint(hex, 0.9),
    '--color-on-primary': readableOn(hex),
    '--color-secondary-hover': tint(hex, 0.8),
    '--gradient-brand': `linear-gradient(145deg, ${hex} 0%, ${shade(hex, 0.2)} 100%)`,
  }
}
