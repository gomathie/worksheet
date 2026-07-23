import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  plugins: [vue(), tailwindcss()],
  server: {
    // `npm run dev:web` proxies API calls to `wrangler pages dev` on :8788
    proxy: {
      '/api': 'http://127.0.0.1:8788',
    },
  },
})
