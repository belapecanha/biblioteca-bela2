import { mkdirSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { randomUUID } from 'node:crypto'
import type { PreviaImportacao, PreviaRestauracao, ResultadoImportacao } from '@shared/api'
import type { Banco } from './db/conexao'
import { prepararCsv, exportarCsv, type PlanoCsv } from './csv'
import {
  criarBackup,
  gravarArquivo,
  prepararBackup,
  protegerDestino,
  restaurarBackup,
  type BackupPreparado
} from './backup'
import { salvarDadosLivro } from './registro'
import { criarIndiceDuplicados } from './duplicados'
import { ultimaLeitura } from './status'
import { salvarLeitura } from './leituras'
import { imagensOrfas, limparImagensOrfas, rotacionarBackupsDeSeguranca } from './imagens'
import { registrarLog } from './log'

export function servicoArquivos(banco: Banco, pasta: string, pastaMigracoes: string) {
  let csv: { token: string; criado: number; plano: PlanoCsv } | undefined
  let restauracao: { token: string; criado: number; plano: BackupPreparado } | undefined
  const validarToken = (token: string, plano?: { token: string; criado: number }) => {
    if (typeof token !== 'string' || !plano || plano.token !== token || Date.now() - plano.criado > 30 * 60 * 1000)
      throw new Error('A prévia expirou. Selecione o arquivo novamente.')
  }
  return {
    prepararCsv(conteudo: string): PreviaImportacao {
      const plano = prepararCsv(banco, conteudo)
      csv = { token: randomUUID(), criado: Date.now(), plano }
      return {
        token: csv.token,
        total: plano.total,
        novos: plano.dados.length,
        repetidos: plano.repetidos,
        invalidos: plano.invalidos,
        titulos: plano.dados.slice(0, 15).map((l) => l.titulo),
        avisos: plano.avisos
      }
    },
    async importarCsv(token: string): Promise<ResultadoImportacao> {
      validarToken(token, csv)
      const plano = csv!.plano
      if (!plano.dados.length) throw new Error('A prévia não contém livros novos para importar.')
      csv = undefined
      const pastaBackups = join(pasta, 'backups')
      mkdirSync(pastaBackups, { recursive: true })
      const backup = join(pastaBackups, `antes-importar-${Date.now()}-${randomUUID()}.bela`)
      await criarBackup(banco, pasta, backup)
      rotacionarBackupsDeSeguranca(pasta)
      let adicionados = 0,
        ignorados = plano.repetidos + plano.invalidos
      banco.sqlite.transaction(() => {
        // O índice acompanha os livros inseridos, para pegar repetidos dentro do próprio CSV.
        const indice = criarIndiceDuplicados(banco.sqlite)
        for (const d of plano.dados) {
          if (indice.procurar(d).length) {
            ignorados++
            continue
          }
          const id = salvarDadosLivro(banco, d)
          indice.adicionar(id, d)
          banco.sqlite.prepare("UPDATE livros SET origem = 'goodreads' WHERE id = ?").run(id)
          if (d.leituraInicial) {
            salvarLeitura(banco, { ...d.leituraInicial, livroId: id, id: ultimaLeitura(banco.sqlite, id)?.id })
          }
          adicionados++
        }
      })()
      registrarLog(
        'info',
        `Importação do CSV: ${adicionados} adicionados, ${ignorados} ignorados. Backup anterior: ${backup}`
      )
      return { adicionados, ignorados, backup }
    },
    exportarCsv(destino: string): void {
      protegerDestino(pasta, destino)
      gravarArquivo(destino, exportarCsv(banco))
    },
    backup(destino: string): Promise<void> {
      return criarBackup(banco, pasta, destino)
    },
    async prepararRestauracao(caminho: string): Promise<PreviaRestauracao> {
      if (restauracao) rmSync(restauracao.plano.pasta, { recursive: true, force: true })
      restauracao = undefined
      const plano = await prepararBackup(banco, caminho, pastaMigracoes)
      restauracao = { token: randomUUID(), criado: Date.now(), plano }
      return {
        token: restauracao.token,
        livros: plano.livros,
        leituras: plano.leituras,
        imagens: plano.arquivos.length,
        nome: plano.nome
      }
    },
    async restaurar(token: string): Promise<{ backup: string }> {
      validarToken(token, restauracao)
      const plano = restauracao!.plano
      restauracao = undefined
      return { backup: await restaurarBackup(banco, pasta, plano) }
    },
    imagensOrfas(): { arquivos: number; bytes: number } {
      const { caminhos, bytes } = imagensOrfas(banco.sqlite, pasta)
      return { arquivos: caminhos.length, bytes }
    },
    limparImagens(): { arquivos: number; bytes: number } {
      const resultado = limparImagensOrfas(banco.sqlite, pasta)
      registrarLog('info', `Limpeza de imagens: ${resultado.arquivos} arquivos, ${resultado.bytes} bytes`)
      return resultado
    },
    fechar(): void {
      if (restauracao) rmSync(restauracao.plano.pasta, { recursive: true, force: true })
    }
  }
}
