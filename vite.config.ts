import react from '@vitejs/plugin-react'
import { defineConfig, loadEnv } from 'vite'
import { createLocalBackend } from './server/local-backend'

// https://vite.dev/config/
export default defineConfig(({ mode }) => ({
  define: mode === 'shared' ? { 'import.meta.env.VITE_SHARED_BACKEND': JSON.stringify('true') } : {},
  server: { host: '127.0.0.1' },
  plugins: [react(), {
    name: 'local-server-api',
    async configureServer(server) {
      const settings = () => {
        const env = loadEnv(mode, process.cwd(), '')
        return { apiKey: env.API_KEY ?? '', baseUrl: env.AI_BASE_URL || 'https://52.79.201.46/v1',
          model: env.AI_MODEL || 'bedrock-gpt-5.6-sol', kakaoKey: env.KAKAO_REST_API_KEY ?? '',
          directionsUrl: env.KAKAO_DIRECTIONS_URL || 'https://apis-navi.kakaomobility.com/v1/directions' }
      }
      if (loadEnv(mode, process.cwd(), '').VITE_LOCAL_BACKEND === 'true') {
        server.middlewares.use(await createLocalBackend(process.cwd(), settings))
      }
    },
  }],
}))
