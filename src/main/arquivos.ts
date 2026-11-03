import { mkdirSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { randomUUID } from 'node:crypto'
import type { PreviaImportacao, PreviaRestauracao, ResultadoImportacao } from '@shared/api'
import type { Banco } from './db/conexao'
import { prepararCsv, exportarCsv, type PlanoCsv } from './csv'
import { criarBackup, gravarArquivo, prepararBackup, protegerDestino, restaurarBackup, type BackupPreparado } from './backup'
import { encontrarDuplicados, salvarDadosLivro } from './registro'
import { salvarLeitura } from './leituras'

export function servicoArquivos(banco: Banco, pasta: string) {
  let csv: { token: string; criado: number; plano: PlanoCsv } | undefined
  let restauracao: { token: string; criado: number; plano: BackupPreparado } | undefined
  const validarToken = (token: string, plano?: { token: string; criado: number }) => {
    if (typeof token !== 'string' || !plano || plano.token !== token || Date.now() - plano.criado > 30 * 60 * 1000) throw new Error('A prévia expirou. Selecione o arquivo novamente.')
  }
  return {
    prepararCsv(conteudo: string): PreviaImportacao {
      const plano = prepararCsv(banco, conteudo)
      csv = { token: randomUUID(), criado: Date.now(), plano }
      return { token: csv.token, total: plano.total, novos: plano.dados.length, repetidos: plano.repetidos, invalidos: plano.invalidos, titulos: plano.dados.slice(0, 15).map((l) => l.titulo), avisos: plano.avisos }
    },
    async importarCsv(token: string): Promise<ResultadoImportacao> {
      validarToken(token, csv)
      const plano = csv!.plano
      if (!plano.dados.length) throw new Error('A prévia não contém livros novos para importar.')
      csv = undefined
      const pastaBackups = join(pasta, 'backups'); mkdirSync(pastaBackups, { recursive: true })
      const backup = join(pastaBackups, `antes-importar-${Date.now()}-${randomUUID()}.bela`)
      await criarBackup(banco, pasta, backup)
      let adicionados = 0, ignorados = plano.repetidos + plano.invalidos
      banco.sqlite.transaction(() => {
        for (const d of plano.dados) {
          if (encontrarDuplicados(banco, d).length) { ignorados++; continue }
          const id = salvarDadosLivro(banco, d)
          banco.sqlite.prepare("UPDATE livros SET origem = 'goodreads' WHERE id = ?").run(id)
          if (d.leituraInicial) {
            const leitura = banco.sqlite.prepare('SELECT id FROM leituras WHERE livro_id = ? ORDER BY id DESC LIMIT 1').get(id) as { id: number } | undefined
            salvarLeitura(banco, { ...d.leituraInicial, livroId: id, id: leitura?.id })
          }
          adicionados++
        }
      })()
      return { adicionados, ignorados, backup }
    },
    exportarCsv(destino: string): void { protegerDestino(pasta, destino); gravarArquivo(destino, exportarCsv(banco)) },
    backup(destino: string): Promise<void> { return criarBackup(banco, pasta, destino) },
    prepararRestauracao(caminho: string): PreviaRestauracao {
      if (restauracao) rmSync(restauracao.plano.pasta, { recursive: true, force: true })
      restauracao = undefined
      const plano = prepararBackup(banco, caminho)
      restauracao = { token: randomUUID(), criado: Date.now(), plano }
      return { token: restauracao.token, livros: plano.livros, leituras: plano.leituras, imagens: plano.arquivos.length, nome: plano.nome }
    },
    async restaurar(token: string): Promise<{ backup: string }> {
      validarToken(token, restauracao)
      const plano = restauracao!.plano
      restauracao = undefined
      return { backup: await restaurarBackup(banco, pasta, plano) }
    },
    fechar(): void { if (restauracao) rmSync(restauracao.plano.pasta, { recursive: true, force: true }) }
  }
}
