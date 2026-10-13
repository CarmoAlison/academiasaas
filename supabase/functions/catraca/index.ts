// Edge Function "catraca" — endereço que o iDFace (Control iD) chama.
// Publicar SEM verificação de JWT (o aparelho não envia login; quem autentica é o token no endereço):
//   npx supabase functions deploy catraca --no-verify-jwt
import { createClient } from 'npm:@supabase/supabase-js@2'
import { encodeBase64 } from 'jsr:@std/encoding@1/base64'
import { handle } from './handler.js'

const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
  auth: { persistSession: false, autoRefreshToken: false },
})

const BUCKET = 'catraca-faces'

Deno.serve((req) =>
  handle(req, {
    rpc: async (token, rota, params) => {
      const { data, error } = await supabase.rpc('catraca_request', { p_token: token, p_rota: rota, p_params: params })
      if (error) throw error
      return data
    },
    fotoBase64: async (path) => {
      const { data, error } = await supabase.storage.from(BUCKET).download(path)
      if (error || !data) throw error ?? new Error('foto não encontrada')
      return encodeBase64(new Uint8Array(await data.arrayBuffer()))
    },
    apagarFoto: async (path) => {
      await supabase.storage.from(BUCKET).remove([path])
    },
    log: (...args) => console.error(...args),
  }),
)
