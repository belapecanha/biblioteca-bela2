import { existsSync, readdirSync, statSync, unlinkSync } from 'node:fs'
import { join } from 'node:path'
import type Database from 'better-sqlite3'

export type PastaImagem = 'capas' | 'miniaturas'
export interface ImagemArquivo {
  pasta: PastaImagem
  nome: string
}
const CHAVES_PERFIL = ['perfil.foto', 'perfil.topo']

// Tudo o que o banco aponta: capas e miniaturas dos livros e as imagens do perfil (em capas/).
export function imagensReferenciadas(sqlite: Database.Database): Record<PastaImagem, Set<string>> {
  const livros = sqlite.prepare('SELECT capa_arquivo capa, miniatura_arquivo miniatura FROM livros').all() as {
    capa: string | null
    miniatura: string | null
  }[]
  const perfil = sqlite
    .prepare(`SELECT valor FROM configuracoes WHERE chave IN (${CHAVES_PERFIL.map(() => '?').join(',')})`)
    .all(...CHAVES_PERFIL) as { valor: string | null }[]
  return {
    capas: new Set([...livros.map((l) => l.capa), ...perfil.map((p) => p.valor)].filter((n): n is string => !!n)),
    miniaturas: new Set(livros.map((l) => l.miniatura).filter((n): n is string => !!n))
  }
}

function apagar(caminho: string): number {
  try {
    const tamanho = statSync(caminho).size
    unlinkSync(caminho)
    return tamanho
  } catch {
    return 0
  }
}

// Apaga imagens que deixaram de ser usadas (capa trocada, livro excluído, foto nova).
// Confere no banco antes, para nunca remover um arquivo que outro registro ainda usa.
export function apagarSeOrfas(sqlite: Database.Database, pastaDados: string, imagens: ImagemArquivo[]): void {
  const usadas = imagensReferenciadas(sqlite)
  for (const { pasta, nome } of imagens)
    if (nome && !usadas[pasta].has(nome) && !/[\\/]/.test(nome)) apagar(join(pastaDados, pasta, nome))
}

export function imagensOrfas(sqlite: Database.Database, pastaDados: string): { caminhos: string[]; bytes: number } {
  const usadas = imagensReferenciadas(sqlite)
  const caminhos: string[] = []
  let bytes = 0
  for (const pasta of ['capas', 'miniaturas'] as const) {
    const origem = join(pastaDados, pasta)
    if (!existsSync(origem)) continue
    for (const item of readdirSync(origem, { withFileTypes: true })) {
      if (!item.isFile() || usadas[pasta].has(item.name)) continue
      const caminho = join(origem, item.name)
      caminhos.push(caminho)
      try {
        bytes += statSync(caminho).size
      } catch {
        /* Sumiu enquanto lia. */
      }
    }
  }
  return { caminhos, bytes }
}

export function limparImagensOrfas(sqlite: Database.Database, pastaDados: string): { arquivos: number; bytes: number } {
  const { caminhos } = imagensOrfas(sqlite, pastaDados)
  let arquivos = 0,
    bytes = 0
  for (const caminho of caminhos) {
    const tamanho = apagar(caminho)
    if (existsSync(caminho)) continue
    arquivos++
    bytes += tamanho
  }
  return { arquivos, bytes }
}

// Os .bela de segurança (antes de importar ou restaurar) têm o tamanho da biblioteca inteira.
export function rotacionarBackupsDeSeguranca(pastaDados: string, manter = 5): void {
  const pasta = join(pastaDados, 'backups')
  if (!existsSync(pasta)) return
  const instante = (nome: string) => Number(/^antes-[a-z]+-(\d+)-/.exec(nome)?.[1] ?? 0)
  const copias = readdirSync(pasta)
    .filter((n) => /^antes-[a-z]+-\d+-[\w-]+\.bela$/.test(n))
    .sort((a, b) => instante(a) - instante(b) || a.localeCompare(b))
  for (const antiga of copias.slice(0, Math.max(0, copias.length - manter))) apagar(join(pasta, antiga))
}
