import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(),tailwindcss()],
  base: "/whiteboard-screenshare/",
  build: {
    outDir: '../docs' // ビルド成果物を親ディレクトリの docs に出力
  }
})
