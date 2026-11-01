// O better-sqlite3 é compilado para o Electron, então os testes rodam no Node dele.
import { spawnSync } from 'node:child_process'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const electron = require('electron')
const vitest = 'node_modules/vitest/vitest.mjs'

const { status } = spawnSync(electron, [vitest, 'run', ...process.argv.slice(2)], {
  stdio: 'inherit',
  env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' }
})
process.exit(status ?? 1)
