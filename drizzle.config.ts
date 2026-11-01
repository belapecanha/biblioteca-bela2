import { defineConfig } from 'drizzle-kit'

export default defineConfig({
  dialect: 'sqlite',
  schema: './src/main/db/esquema.ts',
  out: './src/main/db/migracoes'
})
