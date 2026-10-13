/**
 * Atendimento da catraca Control iD (iDFace em modo online + push).
 *
 * O aparelho é configurado com o endereço:
 *   https://<projeto>.supabase.co/functions/v1/catraca/<token-da-catraca>
 * e chama, a partir dele:
 *   /new_user_identified.fcgi, /new_card.fcgi, /device_is_alive.fcgi, /session_is_valid.fcgi  (modo online)
 *   /push (GET) e /result (POST)                                                               (modo push)
 *   /api/notifications/catra_event                                                             (monitor, se configurado)
 *
 * Toda a regra (quem libera, fila de comandos, cadastro facial) está no banco, em catraca_request().
 * Este arquivo só traduz HTTP ⇄ banco e injeta a foto do rosto nos comandos de cadastro facial.
 */

const json = (body, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })

/** Token e rota a partir do caminho: .../catraca/<token>/<rota> */
export function routeOf(url) {
  const parts = new URL(url).pathname.split('/').filter(Boolean)
  const i = parts.indexOf('catraca')
  const rest = i >= 0 ? parts.slice(i + 1) : parts
  return { token: rest[0] ?? '', rota: rest.slice(1).join('/') }
}

/** Parâmetros da query string + corpo (formulário ou JSON) */
export async function readParams(req) {
  const url = new URL(req.url)
  const params = Object.fromEntries(url.searchParams)
  if (req.method === 'GET' || req.method === 'HEAD') return params
  const type = (req.headers.get('content-type') ?? '').toLowerCase()
  if (type.includes('octet-stream')) return params // imagens/templates: não usados no modo Pro
  const text = await req.text()
  if (!text) return params
  if (type.includes('application/x-www-form-urlencoded')) {
    return { ...params, ...Object.fromEntries(new URLSearchParams(text)) }
  }
  try {
    const parsed = JSON.parse(text)
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) return { ...params, ...parsed }
    return { ...params, response: text }
  } catch {
    if (text.includes('=')) return { ...params, ...Object.fromEntries(new URLSearchParams(text)) }
    return { ...params, response: text }
  }
}

/**
 * @param {Request} req
 * @param {{
 *   rpc: (token: string, rota: string, params: object) => Promise<any>,
 *   fotoBase64: (path: string) => Promise<string>,
 *   apagarFoto: (path: string) => Promise<void>,
 *   log?: (...args: any[]) => void,
 * }} deps
 */
export async function handle(req, deps) {
  const log = deps.log ?? (() => {})
  if (req.method === 'OPTIONS') return new Response(null, { status: 204 })

  const { token, rota } = routeOf(req.url)
  if (!token) return json({ error: 'token ausente' }, 404)

  let params
  try {
    params = await readParams(req)
  } catch {
    params = {}
  }

  let r
  try {
    r = await deps.rpc(token, rota, params)
  } catch (err) {
    log('catraca: erro no banco', rota, err?.message ?? err)
    return json({ error: 'erro interno' }, 500)
  }
  if (!r) return json({ error: 'sem resposta' }, 500)

  // comando de cadastro facial: a foto vai junto, em base64
  let body = r.body ?? null
  if (r.tipo === 'rosto' && r.foto_path && body) {
    try {
      const b64 = await deps.fotoBase64(r.foto_path)
      body = JSON.parse(JSON.stringify(body).replace('"__FOTO__"', JSON.stringify(b64)))
    } catch (err) {
      log('catraca: foto não encontrada', r.foto_path, err?.message ?? err)
      body = null // o comando volta para a fila e é tentado de novo
    }
  }

  // foto do rosto já cadastrada no aparelho: sai do sistema (LGPD)
  if (r.apagar_foto) {
    try {
      await deps.apagarFoto(r.apagar_foto)
    } catch (err) {
      log('catraca: não apagou a foto', r.apagar_foto, err?.message ?? err)
    }
  }

  const status = r.status ?? 200
  if (body === null || body === undefined) return new Response(null, { status })
  return json(body, status)
}
