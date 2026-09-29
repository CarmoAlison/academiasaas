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
