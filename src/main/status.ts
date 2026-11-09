import type Database from 'better-sqlite3'
import type { Status, StatusLeitura } from '@shared/api'

// `livros.status` é derivado da última leitura (por id). A única liberdade é "Quero ler"
// depois de uma leitura encerrada (lido ou abandonado): é a vontade de ler de novo.
// Sem leituras, o livro só pode estar em "Quero ler".
export function statusPermitido(ultima: Status | undefined, status: Status): boolean {
  if (!ultima) return status === 'quero_ler'
  return status === ultima || (status === 'quero_ler' && (ultima === 'lido' || ultima === 'abandonado'))
}

/** A leitura mais recente do livro (maior id): é ela que define o status e recebe a nota. */
export function ultimaLeitura(
  sqlite: Database.Database,
  livroId: number
): { id: number; status: StatusLeitura } | undefined {
  return sqlite.prepare('SELECT id, status FROM leituras WHERE livro_id = ? ORDER BY id DESC LIMIT 1').get(livroId) as
    { id: number; status: StatusLeitura } | undefined
}

// Chamada sempre que uma leitura muda. Mantém o status atual (ou o `preferido`) se ele
// ainda for permitido; senão adota o da última leitura. Também mantém a fila da meta,
// que só aceita livros em "Quero ler".
export function recalcularStatus(sqlite: Database.Database, livroId: number, preferido?: Status): Status {
  const atual = (
    sqlite.prepare('SELECT status FROM livros WHERE id = ?').get(livroId) as { status: Status } | undefined
  )?.status
  if (!atual) throw new Error('Livro não encontrado.')
  const ultima = ultimaLeitura(sqlite, livroId)?.status
  const desejado = preferido ?? atual
  const novo = statusPermitido(ultima, desejado) ? desejado : (ultima ?? 'quero_ler')
  if (novo !== atual)
    sqlite.prepare('UPDATE livros SET status = ?, atualizado_em = CURRENT_TIMESTAMP WHERE id = ?').run(novo, livroId)
  if (novo !== 'quero_ler') sqlite.prepare('DELETE FROM fila_meta WHERE livro_id = ?').run(livroId)
  else if (atual !== 'quero_ler' || preferido === 'quero_ler') {
    sqlite
      .prepare(
        'INSERT OR IGNORE INTO fila_meta (livro_id, posicao) SELECT ?, COALESCE(MAX(posicao), -1) + 1 FROM fila_meta'
      )
      .run(livroId)
  }
  return novo
}

// Corrige dados antigos ou gravados por fora do app (importador). Devolve quantos mudaram.
export function corrigirTodosOsStatus(sqlite: Database.Database): number {
  const ids = sqlite.prepare('SELECT id, status FROM livros').all() as { id: number; status: Status }[]
  let alterados = 0
  sqlite.transaction(() => {
    for (const { id, status } of ids) if (recalcularStatus(sqlite, id) !== status) alterados++
  })()
  return alterados
}
