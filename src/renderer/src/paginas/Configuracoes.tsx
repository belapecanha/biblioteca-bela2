import { useEffect, useState, type FormEvent } from 'react'
import { useMutation, useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import type { PerfilDados, PerfilEdicao } from '@shared/api'
import { AreaTexto, Campo, ErroFormulario } from '../componentes/Formulario'
import { Capa, Estado } from '../componentes/Capa'
import { mensagemErro, usePerfilDados, useSalvar } from '../dados'

function ImagemPerfil({ rotulo, anterior, valor, aoMudar }: { rotulo: string; anterior: string | null; valor: number[] | null | undefined; aoMudar: (valor: number[] | null) => void }) {
  const [preview, setPreview] = useState<string | null>(anterior)
  const [erro, setErro] = useState('')
  useEffect(() => {
    if (valor === undefined || valor === null) { setPreview(valor === null ? null : anterior); return }
    const url = URL.createObjectURL(new Blob([Uint8Array.from(valor)])); setPreview(url)
    return () => URL.revokeObjectURL(url)
  }, [valor, anterior])
  return <div className="coluna perfil-imagem-campo"><label className="rot">{rotulo}<input className="campo campo-arquivo larga" aria-label={rotulo} type="file" accept="image/jpeg,image/png,image/webp" onChange={async (e) => {
    const arquivo = e.target.files?.[0]; e.target.value = ''; if (!arquivo) return
    try { setErro(''); if (arquivo.size > 15 * 1024 * 1024) throw new Error('Escolha uma imagem de até 15 MB.'); aoMudar(Array.from(new Uint8Array(await arquivo.arrayBuffer()))) } catch (erro) { setErro(mensagemErro(erro)) }
  }} /></label>{preview && <div className="perfil-previa"><img src={preview} alt={`Prévia: ${rotulo}`} /><button className="btn btn2 pequeno" type="button" onClick={() => aoMudar(null)}>Remover {rotulo.toLowerCase()}</button></div>}<ErroFormulario erro={erro} /></div>
}
function FormPerfil({ perfil }: { perfil: PerfilDados }) {
  const [nome, setNome] = useState(perfil.nome)
  const [frase, setFrase] = useState(perfil.frase)
  const [foto, setFoto] = useState<number[] | null>()
  const [topo, setTopo] = useState<number[] | null>()
  const salvar = useSalvar((dados: PerfilEdicao) => window.bela.perfil.salvar(dados))
  useEffect(() => { setNome(perfil.nome); setFrase(perfil.frase); setFoto(undefined); setTopo(undefined) }, [perfil.nome, perfil.frase, perfil.foto, perfil.topo])
  function enviar(e: FormEvent) { e.preventDefault(); salvar.mutate({ nome, frase, foto, topo }, { onSuccess: () => { setFoto(undefined); setTopo(undefined) } }) }
  return <form className="card coluna" onSubmit={enviar}><h2>Perfil</h2><Campo rotulo="Nome do perfil" maxLength={100} required value={nome} onChange={(e) => { setNome(e.target.value); salvar.reset() }} /><AreaTexto rotulo="Frase de perfil" valor={frase} linhas={2} aoMudar={(v) => { setFrase(v); salvar.reset() }} /><ImagemPerfil rotulo="Foto do perfil" anterior={perfil.foto} valor={foto} aoMudar={setFoto} /><ImagemPerfil rotulo="Imagem do topo" anterior={perfil.topo} valor={topo} aoMudar={setTopo} /><p className="muted peq sem-margem">JPG, PNG ou WebP, até 15 MB. Sem imagem do topo, o perfil mostra um mosaico das suas capas.</p><button className="btn" disabled={salvar.isPending}>{salvar.isPending ? 'Salvando…' : 'Salvar perfil'}</button><ErroFormulario erro={salvar.error} />{salvar.isSuccess && <p className="sucesso peq sem-margem" role="status">Perfil salvo.</p>}<Link className="link peq" to="/perfil">Ver meu perfil</Link></form>
}
function Importacao() {
  const [erroArquivo, setErroArquivo] = useState('')
  const previa = useMutation({ mutationFn: (csv: string) => window.bela.arquivos.prepararCsv(csv) })
  const importar = useSalvar((token: string) => window.bela.arquivos.importarCsv(token))
  return <section className="card coluna"><h2>Importar do Goodreads</h2><p className="muted peq sem-margem">Escolha o CSV exportado pelo Goodreads. Revise antes de importar; livros já existentes são preservados e ignorados.</p><label className="rot">Arquivo CSV<input className="campo campo-arquivo larga" aria-label="Arquivo CSV do Goodreads" type="file" accept=".csv,text/csv" disabled={previa.isPending || importar.isPending} onChange={async (e) => {
    const arquivo = e.target.files?.[0]; e.target.value = ''; if (!arquivo) return
    previa.reset(); importar.reset(); setErroArquivo('')
    try { if (arquivo.size > 10 * 1024 * 1024) throw new Error('Escolha um CSV de até 10 MB.'); await previa.mutateAsync(await arquivo.text()) } catch (erro) { setErroArquivo(mensagemErro(erro)) }
  }} /></label>{previa.isPending && <p role="status" className="muted peq">Conferindo o arquivo…</p>}<ErroFormulario erro={erroArquivo || previa.error || importar.error} />
    {previa.data && !importar.isSuccess && <div className="coluna importacao-previa"><h3>Prévia da importação</h3><p className="peq sem-margem">{previa.data.total} registros · {previa.data.novos} novos · {previa.data.repetidos} repetidos · {previa.data.invalidos} inválidos</p>{!!previa.data.titulos.length && <ul>{previa.data.titulos.map((t, i) => <li key={i}>{t}</li>)}</ul>}{previa.data.novos > 15 && <p className="muted peq sem-margem">E mais {previa.data.novos - 15} títulos.</p>}{!!previa.data.avisos.length && <details><summary>Ver linhas que precisam de correção</summary><ul>{previa.data.avisos.map((a) => <li key={a}>{a}</li>)}</ul></details>}<p className="muted peq sem-margem">Um backup completo será criado antes de adicionar os livros novos. Notas e resenhas são preservadas.</p><button className="btn" type="button" disabled={!previa.data.novos || importar.isPending} onClick={() => importar.mutate(previa.data!.token)}>{importar.isPending ? 'Importando…' : `Importar ${previa.data.novos} livros novos`}</button></div>}
    {importar.data && <div className="sucesso peq" role="status"><p>{importar.data.adicionados} livros adicionados; {importar.data.ignorados} registros ignorados.</p><p className="caminho-arquivo">Backup anterior: {importar.data.backup}</p></div>}
  </section>
}
function Arquivos() {
  const [confirmar, setConfirmar] = useState(false)
  const exportar = useMutation({ mutationFn: () => window.bela.arquivos.exportarCsv() })
  const backup = useMutation({ mutationFn: () => window.bela.arquivos.backup() })
  const previa = useMutation({ mutationFn: () => window.bela.arquivos.prepararRestauracao() })
  const restaurar = useSalvar((token: string) => window.bela.arquivos.restaurar(token))
  const ocupado = exportar.isPending || backup.isPending || previa.isPending || restaurar.isPending
  return <section className="card coluna"><h2>Exportar e backup</h2><p className="muted peq sem-margem">O backup .bela inclui banco, perfil, listas, capas e miniaturas. O arquivo .env permanece no computador e não entra no backup.</p><div className="linha"><button type="button" className="btn" disabled={ocupado} onClick={() => { backup.reset(); backup.mutate() }}>{backup.isPending ? 'Criando backup…' : 'Criar backup'}</button><button type="button" className="btn btn2" disabled={ocupado} onClick={() => { setConfirmar(false); restaurar.reset(); previa.mutate() }}>Restaurar backup</button><button type="button" className="btn btn2" disabled={ocupado} onClick={() => exportar.mutate()}>Exportar CSV</button></div><p className="muted peq sem-margem">O CSV é uma planilha com os livros e leituras, incluindo notas privadas. Para restaurar a biblioteca inteira, use o backup .bela.</p>
    {backup.data && <p className="sucesso peq caminho-arquivo" role="status">Backup salvo: {backup.data}</p>}{exportar.data && <p className="sucesso peq caminho-arquivo" role="status">CSV salvo: {exportar.data}</p>}<ErroFormulario erro={backup.error || exportar.error || previa.error || restaurar.error} />
    {previa.data && !restaurar.isSuccess && <div className="aviso coluna" role="alert"><h3>Conferir restauração</h3><p className="peq sem-margem">{previa.data.nome}: {previa.data.livros} livros, {previa.data.leituras} leituras e {previa.data.imagens} imagens.</p><p className="peq sem-margem">A biblioteca atual será substituída pelo conteúdo deste backup. Uma cópia completa do estado atual será guardada antes.</p><label className="check peq"><input type="checkbox" checked={confirmar} onChange={(e) => setConfirmar(e.target.checked)} />Conferi e quero substituir a biblioteca por este backup</label><button type="button" className="btn" disabled={!confirmar || ocupado} onClick={() => restaurar.mutate(previa.data!.token)}>Confirmar restauração</button><button type="button" className="btn btn2" disabled={ocupado} onClick={() => previa.reset()}>Cancelar restauração</button></div>}
    {restaurar.data && <p className="sucesso peq caminho-arquivo" role="status">Biblioteca restaurada. Backup anterior: {restaurar.data.backup}</p>}
  </section>
}
export function Configuracoes() {
  const estado = useQuery({ queryKey: ['google-configuracao'], queryFn: () => window.bela.google.configuracao(), staleTime: 0 })
  const perfil = usePerfilDados()
  const pendencias = useQuery({ queryKey: ['pendencias'], queryFn: () => window.bela.perfil.pendencias() })
  const [codigo, setCodigo] = useState<string | null>(null)
  if (!perfil.data) return <Estado carregando={perfil.isLoading} erro={perfil.isError} aoTentar={() => void perfil.refetch()} />
  const atual = pendencias.data?.find((p) => p.codigo === codigo) ?? pendencias.data?.find((p) => p.livros.length) ?? pendencias.data?.[0]
  return <main className="wrap pagina"><h1>Configurações</h1><div className="configuracoes-layout"><aside className="coluna configuracoes-lado"><FormPerfil perfil={perfil.data} /><Importacao /><Arquivos />
    <section className="card coluna configuracao-google"><h2>Google Books</h2><p className="muted peq sem-margem">{estado.isPending ? 'Conferindo configuração…' : estado.data?.configurada ? 'Chave encontrada no arquivo .env.' : 'Nenhuma chave válida no arquivo .env.'}</p><ErroFormulario erro={estado.error} />{estado.data && <p className="muted peq caminho-arquivo sem-margem">Arquivo: {estado.data.arquivo}</p>}<p className="muted peq sem-margem">Para trocar a chave, edite GOOGLE_BOOKS_API_KEY nesse arquivo. Ela vale na próxima busca, sem reiniciar o app.</p><a className="link peq" href="https://developers.google.com/books/docs/v1/using#APIKey" target="_blank" rel="noreferrer">Instruções do Google Books ↗</a></section>
    </aside><section className="pendencias coluna"><div className="sec"><h2>Pendências dos dados</h2><span className="muted peq">{pendencias.data?.reduce((s, p) => s + p.livros.length, 0) ?? '…'} ajustes sugeridos</span></div><p className="muted peq sem-margem">Um livro pode aparecer em mais de uma categoria. Abra a ficha para revisar os dados.</p><div className="linha">{pendencias.data?.map((p) => <button className={`btn btn2 pequeno ${atual?.codigo === p.codigo ? 'on' : ''}`} aria-pressed={atual?.codigo === p.codigo} key={p.codigo} type="button" onClick={() => setCodigo(p.codigo)}>{p.rotulo} ({p.livros.length})</button>)}</div><ErroFormulario erro={pendencias.error} />{pendencias.isPending && <p className="muted">Conferindo seus livros…</p>}<div className="pendencias-livros grade">{atual?.livros.map((l) => <Link key={l.id} className="livro" to={`/livro/${l.id}`}><Capa livro={l} /><span className="livro-titulo">{l.titulo}</span></Link>)}</div>{atual && !atual.livros.length && <p className="muted">Nenhum livro com esta pendência.</p>}</section></div></main>
}
