import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { abrirBanco } from '../db/conexao'
import { bloquearBiblioteca } from '../db/bloqueio'
import { importar, type LivroTratado, type Relatorio } from './importar'

const appdata = process.env.APPDATA!
const pastaDados = process.env.BELA_PASTA_DADOS ?? join(appdata, 'biblioteca-bela')
const pastaAntiga = join(appdata, 'minha-estante')
const substituir = process.argv.includes('--substituir')

function lista(titulo: string, itens: string[]): string {
  return itens.length ? `\n## ${titulo} (${itens.length})\n\n${itens.map((i) => `- ${i}`).join('\n')}\n` : ''
}

function emMarkdown(r: Relatorio): string {
  return `# Relatório da importação

| Dado | Total |
| --- | --- |
| Livros | ${r.livros} |
| Lidos | ${r.lidos} |
| Leituras | ${r.leituras} |
| Nota média | ${r.notaMedia.toFixed(2).replace('.', ',')} |
| Páginas lidas | ${r.paginasLidas.toLocaleString('pt-BR')} |
| Com capa | ${r.capas} |
| Com sinopse | ${r.sinopses} |
| Listas | ${r.listas} |
${lista('Só existiam no app antigo e foram mantidos', r.apenasNoBancoAntigo)}${lista('Status diferente entre Goodreads e app antigo (mantido o Goodreads)', r.statusDivergente)}${lista('Ano corrigido pela estante', r.anosCorrigidos)}${lista('Páginas trazidas do app antigo', r.paginasDoBancoAntigo)}${lista('Marcados como seus', r.posse)}${lista('Favoritos do Perfil', r.favoritos)}${lista('Outros ajustes', r.ajustes)}${lista('Capas encontradas na pasta capa-livros', r.capasDaPasta)}${lista('Sem capa', r.semCapa)}`
}

async function principal(): Promise<void> {
  const caminhoBanco = join(pastaDados, 'biblioteca.db')
  const pastaCapas = join(pastaDados, 'capas')
  const pastaMiniaturas = join(pastaDados, 'miniaturas')

  if (existsSync(caminhoBanco)) {
    if (!substituir) {
      const banco = abrirBanco(caminhoBanco, resolve('src/main/db/migracoes'))
      const { n } = banco.sqlite.prepare('SELECT COUNT(*) n FROM livros').get() as { n: number }
      banco.sqlite.close()
      if (n > 0) throw new Error(`O banco já tem ${n} livros. Use --substituir para refazer, com cópia de segurança.`)
    } else {
      const copia = `${caminhoBanco}.antes-${Date.now()}.bak`
      const banco = abrirBanco(caminhoBanco, resolve('src/main/db/migracoes'))
      try {
        // A API de backup inclui as alterações que ainda estão no WAL.
        await banco.sqlite.backup(copia)
        banco.sqlite.pragma('wal_checkpoint(TRUNCATE)')
      } finally {
        banco.sqlite.close()
      }
      console.log(`Cópia de segurança: ${copia}`)
      for (const sufixo of ['', '-wal', '-shm']) rmSync(caminhoBanco + sufixo, { force: true })
    }
  }
  for (const pasta of [pastaDados, pastaCapas, pastaMiniaturas]) mkdirSync(pasta, { recursive: true })

  // Lê sempre uma cópia, para o banco antigo nunca ser tocado.
  const temporaria = mkdtempSync(join(tmpdir(), 'bela-importacao-'))
  const copiaAntiga = join(temporaria, 'antigo.db')
  copyFileSync(join(pastaAntiga, 'biblioteca.db'), copiaAntiga)

  const banco = abrirBanco(caminhoBanco, resolve('src/main/db/migracoes'))
  try {
    const livros = JSON.parse(readFileSync('dados/livros.json', 'utf-8')) as LivroTratado[]
    const relatorio = await importar(banco, {
      livros,
      caminhoBancoAntigo: copiaAntiga,
      pastaCapasAntigas: join(pastaAntiga, 'capas'),
      pastaCapasAvulsas: resolve('../Biblioteca-bela/capa-livros'),
      pastaCapas,
      pastaMiniaturas
    })
    writeFileSync('dados/relatorio_importacao.md', emMarkdown(relatorio))
    console.log(JSON.stringify({ ...relatorio, semCapa: relatorio.semCapa.length }, null, 1))
  } finally {
    banco.sqlite.close()
    rmSync(temporaria, { recursive: true, force: true })
  }
}

async function executar(): Promise<void> {
  const liberar = bloquearBiblioteca(pastaDados)
  try {
    await principal()
  } finally {
    liberar()
  }
}

executar().catch((erro) => {
  console.error(erro.message)
  process.exitCode = 1
})
