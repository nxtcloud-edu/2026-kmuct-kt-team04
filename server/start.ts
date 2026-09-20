import { createServer } from 'node:http'
import { readFileSync } from 'node:fs'
import { readFile } from 'node:fs/promises'
import { resolve, relative, extname, isAbsolute } from 'node:path'
import { loadEnv } from 'vite'
import { createLocalBackend } from './local-backend'

const root = process.cwd(), dist = resolve(root, 'dist')
const env = { ...loadEnv('shared', root, ''), ...process.env }
const port = Number(env.PORT || 4173)
const middleware = await createLocalBackend(root, () => ({ apiKey: env.API_KEY || '',
  baseUrl: env.AI_BASE_URL || 'https://52.79.201.46/v1', model: env.AI_MODEL || 'bedrock-gpt-5.6-sol',
  kakaoKey: env.KAKAO_REST_API_KEY || '', directionsUrl: env.KAKAO_DIRECTIONS_URL }), {
  publicOrigin: () => {
    try { return readFileSync(resolve(root, '.local-data/public-origin.txt'), 'utf8').trim() }
    catch { return env.PUBLIC_ORIGIN || '' }
  },
})
const mime: Record<string, string> = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.ico': 'image/x-icon' }
const server = createServer((req, res) => {
  void middleware(req, res, () => {
    void (async () => {
      if (req.method !== 'GET' && req.method !== 'HEAD') { res.writeHead(405); res.end(); return }
      const pathname = decodeURIComponent(new URL(req.url ?? '/', 'http://localhost').pathname)
      const file = resolve(dist, `.${pathname === '/' ? '/index.html' : pathname}`)
      const inside = relative(dist, file)
      if (inside.startsWith('..') || isAbsolute(inside) || pathname.split('/').some(part => part.startsWith('.'))) { res.writeHead(403); res.end(); return }
      try {
        const body = await readFile(file)
        res.writeHead(200, { 'Content-Type': mime[extname(file)] ?? 'application/octet-stream', 'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'same-origin' })
        res.end(req.method === 'HEAD' ? undefined : body)
      } catch { res.writeHead(404); res.end('Not found') }
    })().catch(() => { if (!res.headersSent) res.writeHead(400); res.end() })
  })
})
server.requestTimeout = 240000
server.listen(port, '127.0.0.1', () => console.log(`Shared travel server: http://127.0.0.1:${port} (one process, one shared room)`))
