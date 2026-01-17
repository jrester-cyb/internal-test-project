import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { fileURLToPath, URL } from 'url'

const bootModuleId = fileURLToPath(new URL('./src/main.tsx', import.meta.url))

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@app': fileURLToPath(new URL('./src', import.meta.url))
    }
  },
  build: {
    rollupOptions: {
      output: {
        entryFileNames: (chunkInfo: any) => {
          const id = (chunkInfo && (chunkInfo.facadeModuleId || '')) as string
          if (id && id.includes(bootModuleId)) return 'bootloader.[hash].js'
          return 'secure.[name].[hash].js'
        },
        chunkFileNames: (chunkInfo: any) => {
          const modules = chunkInfo && chunkInfo.modules ? Object.keys(chunkInfo.modules) : []
          const isBoot = modules.some((m: string) => m.includes(bootModuleId))
          if (isBoot) return 'bootloader.[hash].js'
          return 'secure.[name].[hash].js'
        },
        assetFileNames: 'assets/[name].[hash][extname]'
      }
    }
  }
})
