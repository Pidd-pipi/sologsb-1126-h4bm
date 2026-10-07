import { fileURLToPath, URL } from 'node:url'
import vue from '@vitejs/plugin-vue'
import { defineConfig } from 'vite'

export default defineConfig({
  plugins: [vue()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url))
    }
  },
  server: {
    port: 21826,
    host: true
  },
  preview: {
    port: 21826
  },
  build: {
    outDir: 'dist',
    sourcemap: false,
    chunkSizeWarningLimit: 1400,
    cssCodeSplit: false,
    rollupOptions: {
      output: {
        manualChunks(id: string): string | undefined {
          return id.includes('node_modules') ? 'vendor' : undefined
        }
      }
    }
  }
})
