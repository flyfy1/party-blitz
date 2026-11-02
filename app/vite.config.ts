import react from '@vitejs/plugin-react'
import { resolve } from 'node:path'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  build: {
    rollupOptions: {
      // lab.html：手机小游戏实验台；demo.html：落地页里的自动演示（都不连 Supabase）
      input: { main: resolve(__dirname, 'index.html'), lab: resolve(__dirname, 'lab.html'), demo: resolve(__dirname, 'demo.html'), try: resolve(__dirname, 'try.html') },
    },
  },
})
