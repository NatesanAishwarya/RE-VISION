import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import { readFileSync } from 'node:fs'

const installed = (name: string): string => {
  try { return JSON.parse(readFileSync(`node_modules/${name}/package.json`, 'utf8')).version } catch { return 'unknown' }
}
const app = JSON.parse(readFileSync('package.json', 'utf8')).version

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  // Recorded with every experiment so it can be repeated against the same library versions.
  define: {
    __VERSIONS__: JSON.stringify({
      app,
      '@tensorflow/tfjs': installed('@tensorflow/tfjs'),
      '@tensorflow-models/coco-ssd': installed('@tensorflow-models/coco-ssd'),
      '@huggingface/transformers': installed('@huggingface/transformers'),
    }),
  },
  server: { proxy: { '/api': 'http://localhost:3001' } },
})
