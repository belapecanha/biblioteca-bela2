import { cpSync, existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { defineConfig, externalizeDepsPlugin } from 'electron-vite'
import react from '@vitejs/plugin-react'
import type { Plugin } from 'vite'

// As migrações são lidas em tempo de execução, então acompanham o build.
function copiarMigracoes(): Plugin {
  return {
    name: 'copiar-migracoes',
    closeBundle() {
      const origem = resolve('src/main/db/migracoes')
      if (existsSync(origem)) cpSync(origem, resolve('out/main/migracoes'), { recursive: true })
    }
  }
}

const compartilhado = { '@shared': resolve('src/shared') }

export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin(), copiarMigracoes()],
    resolve: { alias: compartilhado }
  },
  preload: {
    plugins: [externalizeDepsPlugin()],
    resolve: { alias: compartilhado }
  },
  renderer: {
    root: 'src/renderer',
    // electron-vite usa a porta configurada na URL enviada ao Electron.
    // Se o Vite trocar de porta, a janela pode carregar um servidor antigo.
    server: { strictPort: true },
    resolve: { alias: compartilhado },
    plugins: [react()]
  }
})
