// Empacota o importador e roda no Node do Electron, onde o better-sqlite3 foi compilado.
import { spawnSync } from 'node:child_process'
import { createRequire } from 'node:module'
import { resolve } from 'node:path'
import { build } from 'esbuild'

const require = createRequire(import.meta.url)
const saida = 'out/importar.cjs'

await build({
  entryPoints: ['src/main/importacao/cli.ts'],
  outfile: saida,
  bundle: true,
  platform: 'node',
  format: 'cjs',
  external: ['better-sqlite3', 'sharp'],
  alias: { '@shared': resolve('src/shared') },
  logLevel: 'warning'
})

const { status } = spawnSync(require('electron'), [saida, ...process.argv.slice(2)], {
  stdio: 'inherit',
  env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' }
})
process.exit(status ?? 1)
