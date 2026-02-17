import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')

  return {
    plugins: [react()],
    server: {
      proxy: {
        '/jira-api': {
          target: 'https://cembenchmarking.atlassian.net',
          changeOrigin: true,
          rewrite: (path) => path.replace(/^\/jira-api/, ''),
          configure: (proxy) => {
            proxy.on('proxyReq', (proxyReq) => {
              // Remove any cookies to avoid XSRF issues
              proxyReq.removeHeader('cookie')

              // Add auth header
              const email = env.VITE_JIRA_EMAIL
              const token = env.VITE_JIRA_API_TOKEN
              if (email && token) {
                const auth = Buffer.from(`${email}:${token}`).toString('base64')
                proxyReq.setHeader('Authorization', `Basic ${auth}`)
              }
              proxyReq.setHeader('Accept', 'application/json')
              proxyReq.setHeader('X-Atlassian-Token', 'no-check')
            })
          },
        },
      },
    },
  }
})
