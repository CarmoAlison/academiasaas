import react from '@vitejs/plugin-react'
import { defineConfig, loadEnv } from 'vite'

const REQUIRED_ENV = ['VITE_SUPABASE_URL', 'VITE_SUPABASE_ANON_KEY']

// https://vite.dev/config/
export default defineConfig(({ command, mode }) => {
  // Falha o build (ex.: na Vercel) se faltar variável de ambiente, em vez de publicar um site quebrado
  if (command === 'build') {
    const env = { ...loadEnv(mode, process.cwd(), 'VITE_'), ...process.env }
    const missing = REQUIRED_ENV.filter((key) => !env[key])
    if (missing.length) {
      throw new Error(
        `Variáveis de ambiente ausentes: ${missing.join(', ')}.\n` +
          'Local: crie o arquivo .env (veja .env.example). ' +
          'Vercel: Project Settings → Environment Variables, depois faça Redeploy.',
      )
    }
  }

  return {
    plugins: [react()],
    build: {
      // @react-pdf/renderer (~1,1 MB) é carregado sob demanda, só ao gerar um recibo
      chunkSizeWarningLimit: 1300,
    },
  }
})
