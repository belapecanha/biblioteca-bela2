import { useState, type FormEvent } from 'react'
import type { Citacao, DadosLeitura, Leitura, LivroDetalhe, Progresso } from '@shared/api'
import { AreaTexto, Campo, ErroFormulario, Escolha } from './Formulario'
import { Estrelas } from './Estrelas'
import { estrelasTexto, hoje, NOME_STATUS, useSalvar } from '../dados'

const FORMATOS: [string, string][] = [['', 'Não informado'], ['fisico', 'Físico'], ['ebook', 'E-book'], ['audiolivro', 'Audiolivro']]
function dataTexto(d: string): string { return new Date(`${d}T12:00`).toLocaleDateString('pt-BR') }
function dataLeitura(l: Leitura): string {
  if (l.precisaoFim === 'dia' && l.dataFim) return `Concluído em ${dataTexto(l.dataFim)}`
  if (l.anoFim) return `Lido em ${l.anoFim} · sem dia exato`
  return l.status === 'lido' ? 'Conclusão sem data' : l.dataInicio ? `Início em ${dataTexto(l.dataInicio)}` : 'Sem data de início'
}
function LeituraFormulario({ livro, leitura, aoFechar }: { livro: LivroDetalhe; leitura?: Leitura; aoFechar: () => void }) {
  const [dados, setDados] = useState<DadosLeitura>(() => leitura ? { ...leitura, livroId: livro.id } : {
    livroId: livro.id, status: 'lendo', formato: livro.formato, dataInicio: hoje(), dataFim: null, anoFim: null, precisaoFim: null, nota: null, resenha: null
  })
  const salvar = useSalvar((d: DadosLeitura) => window.bela.leituras.salvar(d))
  const mudar = <K extends keyof DadosLeitura>(campo: K, valor: DadosLeitura[K]) => setDados((d) => ({ ...d, [campo]: valor }))
  async function enviar(e: FormEvent) { e.preventDefault(); try { await salvar.mutateAsync(dados); aoFechar() } catch { /* A mensagem permanece no formulário. */ } }
  return <form className="card coluna leitura-form" onSubmit={enviar} aria-label={leitura ? 'Editar leitura' : 'Nova leitura'}>
    <h3>{leitura ? 'Editar leitura' : livro.leituras.length ? 'Nova releitura' : 'Nova leitura'}</h3>
    <p className="muted peq sem-margem">Cada leitura guarda sua própria nota e resenha. Corrigir uma leitura anterior preserva as demais.</p>
    <div className="form-grid">
      <Escolha rotulo="Status da leitura" valor={dados.status} opcoes={Object.entries(NOME_STATUS).filter(([v]) => v !== 'quero_ler')} aoMudar={(v) => {
        setDados((d) => ({ ...d, status: v as Leitura['status'], dataFim: v === 'lido' ? d.dataFim ?? hoje() : null,
          anoFim: v === 'lido' ? d.anoFim ?? Number(hoje().slice(0, 4)) : null, precisaoFim: v === 'lido' ? d.precisaoFim ?? 'dia' : null }))
      }} />
      <Escolha rotulo="Formato desta leitura" valor={dados.formato ?? ''} opcoes={FORMATOS} aoMudar={(v) => mudar('formato', (v || null) as Leitura['formato'])} />
      <Campo rotulo="Data de início" type="date" value={dados.dataInicio ?? ''} onChange={(e) => mudar('dataInicio', e.target.value || null)} />
      {dados.status === 'lido' && <>
        <Escolha rotulo="Precisão da conclusão" valor={dados.precisaoFim ?? ''} opcoes={[[ '', 'Sem data' ], ['dia', 'Dia exato'], ['ano', 'Somente o ano']]} aoMudar={(v) => setDados((d) => ({ ...d, precisaoFim: (v || null) as Leitura['precisaoFim'], dataFim: v === 'dia' ? hoje() : null, anoFim: v ? Number(hoje().slice(0, 4)) : null }))} />
        {dados.precisaoFim === 'dia' && <Campo rotulo="Data de conclusão" type="date" required value={dados.dataFim ?? ''} onChange={(e) => setDados((d) => ({ ...d, dataFim: e.target.value || null, anoFim: e.target.value ? Number(e.target.value.slice(0, 4)) : null }))} />}
        {dados.precisaoFim === 'ano' && <Campo rotulo="Ano da conclusão" type="number" min="1" max="9999" required value={dados.anoFim ?? ''} onChange={(e) => mudar('anoFim', e.target.value ? Number(e.target.value) : null)} />}
      </>}
    </div>
    <div><span className="rot">Nota desta leitura</span><Estrelas nota={dados.nota} aoMudar={(v) => mudar('nota', v)} /><span className="muted peq"> {dados.nota ? `${String(dados.nota).replace('.', ',')} de 5` : 'Sem nota'}</span></div>
    <AreaTexto rotulo="Resenha desta leitura" valor={dados.resenha ?? ''} aoMudar={(v) => mudar('resenha', v || null)} linhas={5} />
    <ErroFormulario erro={salvar.error} /><div className="linha"><button className="btn" disabled={salvar.isPending}>{salvar.isPending ? 'Salvando…' : 'Salvar leitura'}</button><button className="btn btn2" type="button" onClick={aoFechar}>Cancelar</button></div>
  </form>
}

export function RegistroLeitura({ livro }: { livro: LivroDetalhe }) {
  const [edicao, setEdicao] = useState<number | 'nova' | null>(null)
  const ativa = livro.leituras.some((l) => ['lendo', 'pausado'].includes(l.status))
  return <>
    <section className="coluna">
      <div className="sec"><h2>Histórico de leituras</h2><button type="button" className="btn btn2" disabled={ativa && livro.leituras.length > 0} onClick={() => setEdicao('nova')}>{livro.leituras.length ? 'Registrar releitura' : 'Registrar leitura'}</button></div>
      {ativa && <p className="muted peq sem-margem">Conclua ou abandone a leitura em andamento antes de iniciar outra.</p>}
      {edicao !== null && <LeituraFormulario key={edicao} livro={livro} leitura={typeof edicao === 'number' ? livro.leituras.find((l) => l.id === edicao) : undefined} aoFechar={() => setEdicao(null)} />}
      {!livro.leituras.length && <p className="muted sem-margem">Ainda sem leituras registradas.</p>}
      {livro.leituras.map((l, i) => <article className="historico-leitura" key={l.id}>
        <div className="cabeca"><div><span className="sobretitulo">{livro.leituras.length - i > 1 ? `Leitura ${livro.leituras.length - i} · releitura` : 'Primeira leitura'}</span><h3>{NOME_STATUS[l.status]}</h3><p className="muted peq sem-margem">{dataLeitura(l)}{l.dataInicio && l.status === 'lido' ? ` · início em ${dataTexto(l.dataInicio)}` : ''}</p></div><span className="nota">{estrelasTexto(l.nota) || 'Sem nota'}</span><button type="button" className="btn btn2 pequeno" aria-label={`Editar leitura ${l.id}`} onClick={() => setEdicao(l.id)}>Editar leitura</button></div>
        {l.resenha && <p className="texto-preservado resenha">{l.resenha}</p>}
      </article>)}
    </section>
    <ProgressoLeitura key={`progresso-${livro.leituras[0]?.id ?? 'sem-leitura'}`} livro={livro} />
    <Citacoes livro={livro} />
    <NotasPrivadas key={`notas-${livro.id}`} livro={livro} />
  </>
}

function ProgressoLeitura({ livro }: { livro: LivroDetalhe }) {
  const [leitura, setLeitura] = useState(livro.leituras[0]?.id ?? 0)
  const [data, setData] = useState(livro.leituras[0]?.dataFim ?? hoje())
  const [pagina, setPagina] = useState('')
  const salvar = useSalvar((d: { leitura: number; data: string; pagina: number }) => window.bela.leituras.progresso(livro.id, d.leitura, d.data, d.pagina))
  const remover = useSalvar((id: number) => window.bela.leituras.removerProgresso(livro.id, id))
  const selecionar = (id: number) => { setLeitura(id); const l = livro.leituras.find((v) => v.id === id); setData(l?.dataFim ?? hoje()); salvar.reset() }
  const editar = (p: Progresso) => { setLeitura(p.leituraId); setData(p.data); setPagina(String(p.pagina)); salvar.reset() }
  const idLeitura = leitura || livro.leituras[0]?.id || 0
  const ultimo = livro.progresso.filter((p) => p.leituraId === idLeitura)[0]
  const concluida = livro.leituras.find((l) => l.id === idLeitura)?.status === 'lido'
  const progresso = livro.paginas && ultimo ? Math.min(100, Math.round(ultimo.pagina / livro.paginas * 100)) : null
  async function enviar(e: FormEvent) { e.preventDefault(); try { await salvar.mutateAsync({ leitura: idLeitura, data, pagina: Number(pagina) }); setPagina('') } catch { /* Exibe o erro sem perder os campos. */ } }
  return <section className="coluna"><div className="sec"><h2>Progresso de leitura</h2>{concluida ? <span className="chip">Leitura concluída{livro.paginas ? ` · ${livro.paginas} páginas` : ''}</span> : progresso !== null && <span className="chip">{progresso}% · página {ultimo!.pagina} de {livro.paginas}</span>}</div>
    {idLeitura ? <form className="card coluna" onSubmit={enviar}><div className="form-grid">
      <Escolha rotulo="Leitura do progresso" valor={String(idLeitura)} aoMudar={(v) => selecionar(Number(v))} opcoes={livro.leituras.map((l, i) => [String(l.id), `Leitura ${livro.leituras.length - i} · ${NOME_STATUS[l.status]}`])} />
      <Campo rotulo="Data do progresso" type="date" required value={data} onChange={(e) => setData(e.target.value)} />
      <Campo rotulo="Página alcançada" type="number" min="0" max={livro.paginas ?? 1000000} required value={pagina} onChange={(e) => setPagina(e.target.value)} />
    </div><p className="muted peq sem-margem">Um registro por dia e leitura. Salvar novamente na mesma data corrige a página.</p><ErroFormulario erro={salvar.error} /><button className="btn meio" disabled={salvar.isPending}>Salvar progresso</button>{salvar.isSuccess && <p className="sucesso peq sem-margem" role="status">Progresso salvo.</p>}</form> : <p className="muted sem-margem">Registre uma leitura para acompanhar o progresso.</p>}
    {!!livro.progresso.length && <div className="lista-progresso">{livro.progresso.map((p) => <div className="fila" key={p.id}><span>{dataTexto(p.data)}</span><strong>Página {p.pagina}</strong><span className="muted peq">Leitura {livro.leituras.length - livro.leituras.findIndex((l) => l.id === p.leituraId)}</span><button type="button" className="btn btn2 pequeno" aria-label={`Corrigir progresso de ${p.data}`} onClick={() => editar(p)}>Corrigir</button><button type="button" className="btn btn2 pequeno" disabled={remover.isPending} aria-label={`Remover progresso de ${p.data}`} onClick={() => remover.mutate(p.id)}>Remover</button></div>)}</div>}
    <ErroFormulario erro={remover.error} />
  </section>
}

function Citacoes({ livro }: { livro: LivroDetalhe }) {
  const [citacao, setCitacao] = useState<Omit<Citacao, 'id'> & { id?: number }>({ texto: '', pagina: null })
  const salvar = useSalvar((d: typeof citacao) => window.bela.leituras.salvarCitacao(livro.id, d))
  const remover = useSalvar((id: number) => window.bela.leituras.removerCitacao(livro.id, id))
  async function enviar(e: FormEvent) { e.preventDefault(); try { await salvar.mutateAsync(citacao); setCitacao({ texto: '', pagina: null }) } catch { /* Mantém o trecho para tentar de novo. */ } }
  return <section className="coluna"><div className="sec"><h2>Citações</h2><span className="muted peq">{livro.citacoes.length} guardadas</span></div>
    {livro.citacoes.map((c) => <blockquote className="citacao" key={c.id}><p className="texto-preservado">{c.texto}</p><footer className="linha"><span className="muted peq">{c.pagina ? `Página ${c.pagina}` : 'Sem página'}</span><button type="button" className="btn btn2 pequeno" aria-label={`Editar citação ${c.id}`} onClick={() => { setCitacao(c); salvar.reset() }}>Editar</button><button type="button" className="btn btn2 pequeno" disabled={remover.isPending} aria-label={`Remover citação ${c.id}`} onClick={() => remover.mutate(c.id)}>Remover</button></footer></blockquote>)}
    <form className="card coluna" onSubmit={enviar} aria-label={citacao.id ? 'Editar citação' : 'Nova citação'}><AreaTexto rotulo="Trecho da citação" valor={citacao.texto} aoMudar={(v) => setCitacao((c) => ({ ...c, texto: v }))} /><Campo rotulo="Página da citação" type="number" min="1" value={citacao.pagina ?? ''} onChange={(e) => setCitacao((c) => ({ ...c, pagina: e.target.value ? Number(e.target.value) : null }))} /><div className="linha"><button className="btn" disabled={!citacao.texto.trim() || salvar.isPending}>{citacao.id ? 'Salvar citação' : 'Guardar citação'}</button>{citacao.id && <button type="button" className="btn btn2" onClick={() => setCitacao({ texto: '', pagina: null })}>Cancelar edição</button>}</div><ErroFormulario erro={salvar.error || remover.error} /></form>
  </section>
}
function NotasPrivadas({ livro }: { livro: LivroDetalhe }) {
  const [texto, setTexto] = useState(livro.notasPrivadas ?? '')
  const salvar = useSalvar((valor: string) => window.bela.livros.salvarNotas(livro.id, valor || null))
  return <section className="coluna"><div className="sec"><h2>Notas privadas</h2></div><form className="card coluna" onSubmit={(e) => { e.preventDefault(); salvar.mutate(texto) }}><AreaTexto rotulo="Suas anotações sobre o livro" valor={texto} aoMudar={(v) => { setTexto(v); salvar.reset() }} linhas={5} /><span className="muted peq">Estas notas ficam somente na sua biblioteca, separadas da resenha.</span><button className="btn meio" disabled={salvar.isPending}>Salvar notas</button><ErroFormulario erro={salvar.error} />{salvar.isSuccess && <p className="sucesso peq sem-margem" role="status">Notas salvas.</p>}</form></section>
}
