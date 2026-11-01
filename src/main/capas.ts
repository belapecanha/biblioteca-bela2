import { resolve, sep } from 'node:path'

// Só aceita arquivos diretamente dentro das pastas de capas, nunca fora delas.
export function resolverCapa(pastaCapas: string, pastaMiniaturas: string, url: string): string | null {
  let endereco: URL
  try {
    endereco = new URL(url)
  } catch {
    return null
  }

  const pastas: Record<string, string> = { original: pastaCapas, miniatura: pastaMiniaturas }
  const pasta = pastas[endereco.hostname]
  if (!pasta) return null

  let nome: string
  try {
    nome = decodeURIComponent(endereco.pathname.slice(1))
  } catch {
    return null
  }
  if (!nome || nome.includes('/') || nome.includes('\\')) return null

  const caminho = resolve(pasta, nome)
  return caminho.startsWith(resolve(pasta) + sep) ? caminho : null
}
