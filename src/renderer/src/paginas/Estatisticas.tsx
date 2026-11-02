import { useMemo, useState, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import type { BaseAnalise, LivroAnalise } from '@shared/api'
import { calcular, comCapaPrimeiro, dec, filaMaisAntiga, filtrar, fmt, media, metaDoAno, MESES_LONGOS, mudeiDeIdeia, tempoNaFila, variarSeries, type ChaveFiltro, type Contagem, type Estatisticas as DadosEstatisticas, type Filtros } from '@shared/estatisticas'
import { Capa, Estado } from '../componentes/Capa'
import { Escolha } from '../componentes/Formulario'
import { estrelasTexto, mensagemErro, NOME_STATUS, useAnalise } from '../dados'
import mapaMundi from '../mapa-mundi.json'

type Serie = DadosEstatisticas['series'][number]
const COR = { roxo: '#A958D8', azul: '#2E9AC4', dourado: '#B28A1E', neutro: '#7D8C98' }
const TIPOS: Record<string, string> = { livro: 'Livros', manhwa: 'Manhwas', manga: 'Mangás', graphic_novel: 'Graphic novels', poesia: 'Poesia' }
const FORMATOS: Record<string, string> = { fisico: 'Físico', ebook: 'E-book', audiolivro: 'Audiolivro', sem: 'Sem formato' }
const CLASSES: Record<string, string> = { sim: 'Ficção', nao: 'Não ficção', sem: 'Sem classificação' }
const NOME_FILTRO: Record<ChaveFiltro, string> = { genero: 'Gênero', tema: 'Tema', mood: 'Mood', tipo: 'Tipo', formato: 'Formato', pais: 'País', status: 'Status', autor: 'Autor', mes: 'Mês', decada: 'Década', nota: 'Nota', classe: 'Classe' }
const opcoesDe = (lista: string[]): [string, string][] => [['', 'Todos'], ...[...new Set(lista)].sort((a, b) => a.localeCompare(b, 'pt-BR')).map((v): [string, string] => [v, v])]
const anoCurto = (a: number | string) => `'${String(a).slice(2)}`
const notaTexto = (n: number) => dec(n).replace(',0', '')

export function Estatisticas() {
  const consulta = useAnalise()
  if (!consulta.data) return <Estado carregando={consulta.isLoading} erro={consulta.isError} aoTentar={() => void consulta.refetch()} />
  return <Painel base={consulta.data} />
}

function Coluna({ titulo, rotulo, valor, altura, cor = COR.roxo, marcada, aoClicar }: { titulo: string; rotulo: string; valor: number; altura: number; cor?: string; marcada?: boolean; aoClicar: () => void }) {
  return <button type="button" className={marcada ? 'est-coluna on' : 'est-coluna'} title={titulo} aria-label={`Filtrar ${titulo}`} aria-pressed={!!marcada} onClick={aoClicar}><span>{valor}</span><i style={{ height: altura, background: cor }} /><span className="muted">{rotulo}</span></button>
}

function Ranking({ titulo, cor, itens, ativo, aoClicar }: { titulo: string; cor: string; itens: Contagem[]; ativo?: string; aoClicar: (v: string) => void }) {
  const maximo = itens[0]?.[1] ?? 1
  return <div className="card"><h3>{titulo}</h3><div className="est-ranking">{itens.slice(0, 8).map(([nome, v]) => <button key={nome} type="button" className={ativo === nome ? 'on peq' : 'peq'} aria-pressed={ativo === nome} onClick={() => aoClicar(nome)}><span className="est-linha"><span>{TIPOS[nome] ?? nome}</span><strong>{v}</strong></span><i style={{ width: `${Math.round((v / maximo) * 100)}%`, background: cor }} /></button>)}</div>{!itens.length && <p className="muted peq">Nada neste recorte.</p>}</div>
}

function Rosca({ titulo, itens }: { titulo: string; itens: { nome: string; v: number; cor: string; aoClicar: () => void }[] }) {
  const total = itens.reduce((s, i) => s + i.v, 0)
  let soma = 0
  const fatias = itens.map((i) => { const ini = soma; soma += i.v; return `${i.cor} ${(ini / (total || 1)) * 100}% ${(soma / (total || 1)) * 100}%` })
  return <div className="card"><h3>{titulo}</h3><div className="est-rosca"><div role="img" aria-label={itens.map((i) => `${i.nome} ${i.v}`).join(', ')} style={{ background: total ? `conic-gradient(${fatias.join(',')})` : '#3D4D5A' }}><span /></div><div className="peq">{itens.map((i) => <button key={i.nome} type="button" onClick={i.aoClicar}><i style={{ background: i.cor }} />{i.nome}: <strong>{i.v}</strong></button>)}</div></div></div>
}

function Colecao({ titulo, sub, livros, vazio, limite = 30 }: { titulo: string; sub: string; livros: LivroAnalise[]; vazio?: string; limite?: number }) {
  return <section><div className="sec"><h2>{titulo}</h2><span className="muted peq">{sub}</span></div>{livros.length ? <div className="est-capas">{livros.slice(0, limite).map((l) => <Link key={l.id} className="livro" to={`/livro/${l.id}`} title={l.titulo} aria-label={l.titulo}><Capa livro={l} /><span className="nota peq">{estrelasTexto(l.nota)}</span></Link>)}</div> : <p className="muted">{vazio ?? 'Nenhum livro neste recorte.'}</p>}</section>
}

function Secao({ titulo, children }: { titulo: string; children: ReactNode }) {
  return <section className="coluna"><div className="sec"><h2>{titulo}</h2></div>{children}</section>
}

function tomCalor(v: number): [string, string] {
  return v >= 4.5 ? ['#D5C7F5', '#150D26'] : v >= 4.2 ? ['#A98FE6', '#150D26'] : v >= 3.9 ? ['#6F54AE', '#FBF8FF'] : ['#4A3A73', '#FBF8FF']
}
const tomMapa = (n: number) => (n >= 40 ? '#D5C7F5' : n >= 20 ? '#A98FE6' : n >= 8 ? '#7258B4' : n > 0 ? '#4E3E78' : '#3D4D5A')

function Painel({ base }: { base: BaseAnalise }) {
  const [ano, setAno] = useState('')
  const [f, setF] = useState<Filtros>({})
  const cliente = useQueryClient()
  const hoje = new Date()
  const anoAtual = hoje.getFullYear()
  const salvarMeta = useMutation({
    mutationFn: (livros: number | null) => window.bela.analise.definirMeta(anoAtual, livros),
    onSuccess: () => void cliente.invalidateQueries({ queryKey: ['livros', 'analise'] })
  })
  const a = ano ? Number(ano) : null
  const recorte = useMemo(() => filtrar(base.livros, f), [base, f])
  const S = useMemo(() => calcular(recorte, a, hoje), [recorte, a])

  const alterna = (k: ChaveFiltro, v: string | number) => setF((atual) => {
    const novo = { ...atual }
    if (novo[k] === String(v)) delete novo[k]
    else novo[k] = String(v)
    return novo
  })
  const define = (k: ChaveFiltro) => (v: string) => setF((atual) => { const novo = { ...atual }; if (v) novo[k] = v; else delete novo[k]; return novo })
  const rotulo = (k: ChaveFiltro, v: string) => k === 'mes' ? MESES_LONGOS[Number(v) - 1] : k === 'nota' ? `${notaTexto(Number(v))} estrelas` : k === 'decada' ? `anos ${v}` : k === 'status' ? NOME_STATUS[v as keyof typeof NOME_STATUS] : k === 'formato' ? FORMATOS[v] : k === 'classe' ? CLASSES[v] : k === 'tipo' ? TIPOS[v] : k === 'autor' ? (base.livros.flatMap((l) => l.autores).find((x) => String(x.id) === v)?.nome ?? v) : v

  const chaves = Object.keys(f) as ChaveFiltro[]
  const doFiltro = f.status && f.status !== 'lido' ? recorte.livros : S.R
  const anosTodos = [...new Set(base.livros.flatMap((l) => l.leituras.flatMap((x) => (x.ano === null ? [] : [x.ano]))))].sort((x, y) => y - x)
  const anosK = [...S.porAno.keys()].sort((x, y) => x - y)
  const maxLivros = Math.max(1, ...anosK.map((k) => S.porAno.get(k)!.livros))
  const maxPaginas = Math.max(1, ...anosK.map((k) => S.porAno.get(k)!.paginas))
  const pontos = anosK.map((k, i) => ({ k, x: Math.round(18 + (i * 484) / Math.max(1, anosK.length - 1)), y: Math.round(198 - (S.porAno.get(k)!.paginas / maxPaginas) * 180) }))
  const maxMes = Math.max(1, ...S.meses.map((m) => m.q))
  const maxDecada = Math.max(1, ...S.decadas.map((d) => d[1]))
  const maxNota = Math.max(1, ...S.notasDist.map((n) => n[1]))
  const statusB = (['lido', 'lendo', 'quero_ler', 'pausado', 'abandonado'] as const).map((s, i) => ({ s, v: recorte.livros.filter((l) => l.status === s).length, c: [COR.roxo, COR.azul, COR.dourado, COR.neutro, '#B9C3C9'][i] }))
  const moodsCalor = S.moods.slice(0, 6).map((m) => m[0])
  const generosCalor = S.generos.slice(0, 6).map((g) => g[0])
  const qPais = new Map(S.paises)
  const pct = (s: { lidos: number; total: number }) => Math.round((s.lidos / s.total) * 100)
  const fila = filaMaisAntiga(recorte.livros)
  const naFila = tempoNaFila(recorte.livros)
  const metaValor = base.metas[anoAtual] ?? null
  const meta = metaDoAno(base.livros, anoAtual, hoje)
  const antigo = fila.find((l) => l.origem === 'manual')
  const tenho = recorte.livros.filter((l) => l.posse === 'tenho')
  const selects: [ChaveFiltro, string[]][] = [
    ['genero', base.livros.flatMap((l) => l.generos)], ['tema', base.livros.flatMap((l) => l.temas)], ['mood', base.livros.flatMap((l) => l.moods)],
    ['pais', base.livros.flatMap((l) => (l.pais ? [l.pais] : []))]
  ]
  const ritmo: [string, string][] = [[dec(S.livrosPorAno), 'livros por ano'], [dec(S.livrosPorAno / 12), 'livros por mês'], [dec(S.livrosPorDia, 2), 'livros por dia'], [fmt(Math.round(S.paginasPorAno)), 'páginas por ano'], [fmt(Math.round(S.paginasPorAno / 12)), 'páginas por mês'], [dec(S.paginasPorDia), 'páginas por dia'], [fmt(Math.round(S.diasPorLivro)), 'dias por livro']]
  const qFormato = (k: string) => S.formatos.find((x) => x[0] === k)?.[1] ?? 0
  const formatos = [['fisico', COR.roxo], ['ebook', COR.azul], ['audiolivro', COR.dourado], ['sem', COR.neutro]].filter(([k]) => k !== 'audiolivro' || qFormato(k) > 0)

  return <main className="wrap pagina estatisticas">
    <section className="coluna">
      <div className="cabeca"><h1>Sua vida em livros</h1><div className="linha est-periodo"><Escolha rotulo="Período" valor={ano} aoMudar={setAno} opcoes={[['', 'Todo o período'], ...anosTodos.map((x): [string, string] => [String(x), String(x)])]} /><Link className="btn btn2" to={`/retrospectiva${a ? `?ano=${a}` : ''}`}>Ver retrospectiva</Link></div></div>
      <div className="est-filtros">
        {selects.map(([k, lista]) => <Escolha key={k} rotulo={NOME_FILTRO[k]} valor={f[k] ?? ''} aoMudar={define(k)} opcoes={opcoesDe(lista)} />)}
        <Escolha rotulo="Tipo" valor={f.tipo ?? ''} aoMudar={define('tipo')} opcoes={[['', 'Todos'], ...Object.entries(TIPOS)]} />
        <Escolha rotulo="Formato" valor={f.formato ?? ''} aoMudar={define('formato')} opcoes={[['', 'Todos'], ['fisico', 'Físico'], ['ebook', 'E-book'], ['audiolivro', 'Audiolivro']]} />
      </div>
      <p className="peq muted sem-margem">Clique em uma barra, fatia, país ou autor para filtrar todos os gráficos.</p>
      {chaves.length > 0 && <div className="card est-filtrado"><div className="linha"><strong>{doFiltro.length} {doFiltro.length === 1 ? 'livro' : 'livros'}</strong>{chaves.map((k) => <button key={k} type="button" className="btn btn2 pequeno" aria-label={`Remover filtro ${NOME_FILTRO[k]}: ${rotulo(k, f[k]!)}`} onClick={() => alterna(k, f[k]!)}>{NOME_FILTRO[k]}: {rotulo(k, f[k]!)} ×</button>)}<button type="button" className="link est-limpar" onClick={() => setF({})}>Limpar filtros</button></div><div className="est-capas mini">{comCapaPrimeiro(doFiltro).slice(0, 24).map((l) => <Link key={l.id} className="livro" to={`/livro/${l.id}`} title={l.titulo} aria-label={l.titulo}><Capa livro={l} /></Link>)}</div></div>}
      <div className="est-kpis">{([[S.n, 'livros lidos'], [fmt(S.paginas), 'páginas lidas'], [S.autoresTotal, 'autores diferentes'], [dec(S.media), 'nota média'], [S.resenhas, 'resenhas'], [S.cinco.length, 'livros com 5 estrelas']] as const).map(([v, n], i) => <div className={i === 0 ? 'card alto' : 'card'} key={n}><p className="num sem-margem">{v}</p><p className="peq muted sem-margem">{n}</p></div>)}</div>
      <div className="est-grade g320">
        <div className="card"><h3>Biblioteca por status</h3><div className="est-status" role="group" aria-label={statusB.map((s) => `${NOME_STATUS[s.s]} ${s.v}`).join(', ')}>{statusB.map((s) => <button key={s.s} type="button" title={`${NOME_STATUS[s.s]}: ${s.v}`} aria-label={`Filtrar ${NOME_STATUS[s.s]}: ${s.v}`} onClick={() => alterna('status', s.s)} style={{ flex: `${s.v} 1 0`, minWidth: s.v ? 5 : 0, background: s.c }} />)}</div><div className="linha peq est-legenda">{statusB.map((s) => <span key={s.s}><i style={{ background: s.c }} />{NOME_STATUS[s.s]} <strong>{s.v}</strong></span>)}</div></div>
        <div className="card"><h3>Ritmo</h3><div className="est-ritmo">{ritmo.map(([v, n]) => <div key={n}><p className="num sem-margem">{v}</p><p className="peq muted sem-margem">{n}</p></div>)}</div><p className="peq muted">Só considera leituras com ano registrado.</p></div>
      </div>
    </section>

    <Secao titulo="Ao longo do tempo"><div className="est-grade g440">
      <div className="card"><h3>Livros por ano</h3><div className="est-barras" style={{ height: 220 }}>{anosK.map((k) => <Coluna key={k} titulo={`${k}: ${S.porAno.get(k)!.livros} livros`} rotulo={anoCurto(k)} valor={S.porAno.get(k)!.livros} altura={Math.round((S.porAno.get(k)!.livros / maxLivros) * 160)} cor={a === k ? COR.roxo : '#58707F'} marcada={a === k} aoClicar={() => setAno(a === k ? '' : String(k))} />)}</div></div>
      <div className="card"><h3>Páginas por ano</h3><svg className="est-svg" viewBox="0 0 520 230" role="img" aria-label="Páginas lidas por ano"><line x1="0" y1="198" x2="520" y2="198" stroke="#3D4D5A" /><polyline points={pontos.map((p) => `${p.x},${p.y}`).join(' ')} fill="none" stroke={COR.azul} strokeWidth="2" />{pontos.map((p) => <g key={p.k}><circle cx={p.x} cy={p.y} r="5" fill={COR.azul} stroke="#25323C" strokeWidth="2"><title>{`${p.k}: ${fmt(S.porAno.get(p.k)!.paginas)} páginas`}</title></circle><text x={p.x} y="218" textAnchor="middle" fontSize="12" fill="#B9C3C9">{anoCurto(p.k)}</text></g>)}</svg></div>
      <div className="card"><h3>Livros por mês</h3><div className="est-barras" style={{ height: 150 }}>{S.meses.map((m) => <Coluna key={m.m} titulo={`${m.m}: ${m.q}`} rotulo={m.m} valor={m.q} altura={Math.round((m.q / maxMes) * 90)} marcada={f.mes === String(m.i + 1)} aoClicar={() => alterna('mes', m.i + 1)} />)}</div><p className="peq muted">Só considera leituras com data exata.</p></div>
      <div className="card"><h3>Ano de publicação</h3><div className="est-barras" style={{ height: 150 }}>{S.decadas.map(([d, q]) => <Coluna key={d} titulo={`década de ${d}: ${q}`} rotulo={`'${String(d).slice(2, 3)}0`} valor={q} altura={Math.max(3, Math.round((q / maxDecada) * 96))} cor={COR.azul} marcada={f.decada === String(d)} aoClicar={() => alterna('decada', d)} />)}</div><p className="peq muted">Por década.</p></div>
    </div></Secao>

    <Secao titulo="Perfil de leitura">
      <div className="est-grade g290">
        <Rosca titulo="Ficção e não ficção" itens={[{ nome: 'Ficção', v: S.ficcao, cor: COR.roxo, aoClicar: () => alterna('classe', 'sim') }, { nome: 'Não ficção', v: S.naoFiccao, cor: COR.azul, aoClicar: () => alterna('classe', 'nao') }, { nome: 'Sem dado', v: S.semClasse, cor: COR.neutro, aoClicar: () => alterna('classe', 'sem') }]} />
        <Rosca titulo="Formato" itens={formatos.map(([k, cor]) => ({ nome: k === 'sem' ? 'Sem dado' : FORMATOS[k], v: qFormato(k), cor, aoClicar: () => alterna('formato', k) }))} />
        <div className="card"><h3>Distribuição de notas</h3><div className="est-barras" style={{ height: 132 }}>{S.notasDist.map(([v, q]) => <Coluna key={v} titulo={`nota ${notaTexto(v)}: ${q}`} rotulo={notaTexto(v)} valor={q} altura={Math.round((q / maxNota) * 86)} marcada={f.nota === String(v)} aoClicar={() => alterna('nota', v)} />)}</div></div>
        <Ranking titulo="Gêneros" cor={COR.roxo} itens={S.generos} ativo={f.genero} aoClicar={(v) => alterna('genero', v)} />
        <Ranking titulo="Temas" cor={COR.dourado} itens={S.temas} ativo={f.tema} aoClicar={(v) => alterna('tema', v)} />
        <Ranking titulo="Moods" cor={COR.azul} itens={S.moods} ativo={f.mood} aoClicar={(v) => alterna('mood', v)} />
        <Ranking titulo="Tipos" cor={COR.dourado} itens={S.tipos} ativo={f.tipo} aoClicar={(v) => alterna('tipo', v)} />
      </div>
      <div className="card"><h3>Nota média por gênero e mood</h3><div className="est-calor"><table><thead><tr><th scope="col"><span className="oculto">Gênero</span></th>{moodsCalor.map((h) => <th key={h} scope="col">{h}</th>)}</tr></thead><tbody>{generosCalor.map((g) => <tr key={g}><th scope="row">{g}</th>{moodsCalor.map((h) => {
        const notas = S.calor.get(`${g}|${h}`) ?? []
        const m = media(notas)
        const [fundo, texto] = notas.length >= 3 ? tomCalor(m) : ['#2C3944', '#F3E9DC']
        const titulo = notas.length >= 3 ? `${g} e ${h}: nota ${dec(m)}, ${notas.length} leituras` : `${g} e ${h}: poucos livros`
        return <td key={h} title={titulo} style={{ background: fundo }}><button type="button" aria-label={titulo} style={{ color: texto }} onClick={() => setF((x) => ({ ...x, genero: g, mood: h }))}>{notas.length >= 3 ? dec(m) : ''}</button></td>
      })}</tr>)}</tbody></table></div><p className="peq muted">Cor mais clara significa nota mais alta. Mostra combinações com 3 ou mais leituras.</p></div>
      <div className="card"><h3>Países de publicação</h3><div className="est-mapa"><svg viewBox="0 0 936 390" role="img" aria-label={S.paises.map((p) => `${p[0]} ${p[1]}`).join(', ') || 'Sem países neste recorte'}>{(mapaMundi as [string, number, string][]).map(([nome, , d], i) => <path key={i} d={d} fill={f.pais === nome ? COR.dourado : tomMapa(qPais.get(nome) ?? 0)} stroke="#25323C" strokeWidth=".7" style={{ cursor: nome ? 'pointer' : 'default' }} onClick={nome ? () => alterna('pais', nome) : undefined}><title>{nome ? `${nome}: ${qPais.get(nome) ?? 0}` : 'Sem livros'}</title></path>)}</svg><div className="peq est-paises">{S.paises.slice(0, 8).map(([nome, v]) => <button key={nome} type="button" aria-pressed={f.pais === nome} onClick={() => alterna('pais', nome)}><span>{nome}</span><strong>{v}</strong></button>)}{!S.paises.length && <p className="muted">Sem país de publicação neste recorte.</p>}</div></div></div>
    </Secao>

    <Secao titulo="Autores e séries">
      <div className="card"><h3>Autores mais lidos</h3><div className="est-autores">{S.autoresVariados.slice(0, 6).map((x) => {
        const ns = x.notas.length > 1 ? x.notas : [x.notas[0] ?? 0, x.notas[0] ?? 0]
        return <div key={x.id}><div className="est-autor"><button type="button" className="titulo-botao" aria-pressed={f.autor === String(x.id)} onClick={() => alterna('autor', x.id)}>{x.nome}</button><p className="peq muted sem-margem">{x.livros.length} {x.livros.length === 1 ? 'livro' : 'livros'}{x.notas.length ? `, nota ${dec(media(x.notas))}` : ''}</p><p className="peq sem-margem est-autor-links">{x.membros.map((m) => <Link key={m.id} className="link" to={`/autor/${m.id}`}>{x.membros.length > 1 ? m.nome : 'Ver página'}</Link>)}</p><svg viewBox="0 0 120 30" role="img" aria-label={`Notas de ${x.nome}`}><polyline points={ns.map((v, i) => `${Math.round(4 + (i * 112) / (ns.length - 1))},${Math.round(27 - (v / 5) * 24)}`).join(' ')} fill="none" stroke={COR.roxo} strokeWidth="2" /></svg></div><div className="est-autor-capas">{variarSeries(x.livros).slice(0, 4).map((l) => <Link key={l.id} className="livro" to={`/livro/${l.id}`} aria-label={l.titulo} title={l.titulo}><Capa livro={l} /></Link>)}</div></div>
      })}</div></div>
      <div className="est-grade g340">{([['Séries por livros', COR.azul, [...S.series].filter((s) => s.lidos).sort((x, y) => pct(y) - pct(x) || y.lidos - x.lidos), (s: Serie) => `${s.lidos} de ${s.total}`], ['Séries por páginas', COR.roxo, [...S.series].sort((x, y) => y.paginas - x.paginas), (s: Serie) => `${fmt(s.paginas)} páginas`]] as const).map(([titulo, cor, lista, texto]) => <div className="card" key={titulo}><h3>{titulo}</h3><div className="est-series">{lista.slice(0, 7).map((s) => <div className="peq" key={s.nome}><span className="est-linha"><span>{s.nome}</span><strong>{texto(s)}</strong></span><div role="img" aria-label={`${pct(s)}%`}><i style={{ width: `${pct(s)}%`, background: cor }} /></div></div>)}</div><p className="peq muted">Sobre os volumes cadastrados.</p></div>)}</div>
    </Secao>

    <Secao titulo="Metas e planejamento"><div className="est-grade g240">
      <div className="card alto"><h3>Meta de {anoAtual}</h3><p className="num est-meta">{metaValor ? `${meta.lidos} de ${metaValor}` : `${meta.lidos} ${meta.lidos === 1 ? 'livro' : 'livros'}`}</p>{metaValor !== null && <div className="est-progresso" role="img" aria-label={`${Math.min(100, Math.round((meta.lidos / metaValor) * 100))}%`}><i style={{ width: `${Math.min(100, Math.round((meta.lidos / metaValor) * 100))}%` }} /></div>}<div className="linha est-meta-campo"><label className="rot sem-margem" htmlFor="meta-ano">Meta</label><input id="meta-ano" key={metaValor ?? 'vazia'} className="campo" type="number" min="1" defaultValue={metaValor ?? ''} onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur() }} onBlur={(e) => { const v = e.target.value ? Number(e.target.value) : null; if (v !== metaValor && (v === null || (Number.isInteger(v) && v > 0))) salvarMeta.mutate(v) }} /></div>{salvarMeta.isError && <p className="erro peq" role="alert">{mensagemErro(salvarMeta.error)}</p>}<p className="peq sem-margem">{metaValor ? `Faltam ${Math.max(0, metaValor - meta.lidos)} em ${meta.diasRestantes} dias.` : 'Defina quantos livros quer ler neste ano.'}</p></div>
      <div className="card"><h3>Previsão para {anoAtual}</h3><p className="num est-meta">{meta.previsao} {meta.previsao === 1 ? 'livro' : 'livros'}</p><p className="peq muted sem-margem">no ritmo atual do ano</p></div>
      <div className="card"><h3>Tempo na fila</h3>{naFila ? <><p className="num est-meta">{Math.round(naFila.media)} dias</p><p className="peq muted sem-margem">em média · menor {naFila.menor}, maior {naFila.maior} · {naFila.n} {naFila.n === 1 ? 'livro' : 'livros'}</p></> : <p className="peq muted">Tempo médio, menor e maior espera entre adicionar e começar. Começa a contar nos próximos livros adicionados, porque sua lista foi importada de uma vez.</p>}</div>
      <div className="card"><h3>Biblioteca própria</h3><p className="num est-meta">{tenho.length}</p><p className="peq muted sem-margem">livros marcados como seus, {tenho.filter((l) => l.status === 'lido').length} já lidos</p></div>
    </div></Secao>

    <Secao titulo="Recordes"><div className="est-grade g280">{([['Mais longo', S.maior, S.maior && `${fmt(S.maior.paginas ?? 0)} páginas`], ['Mais curto', S.menor, S.menor && `${fmt(S.menor.paginas ?? 0)} páginas`], ['Há mais tempo na fila', antigo ?? fila[0] ?? null, antigo ? `Desde ${new Date(`${antigo.criadoEm.slice(0, 10)}T12:00`).toLocaleDateString('pt-BR')}` : 'Sem data de entrada, por ter sido importado']] as const).map(([nome, l, v]) => l && <Link className="card est-recorde" key={nome} to={`/livro/${l.id}`}><Capa livro={l} /><div><p className="peq muted sem-margem">{nome}</p><strong>{l.titulo}</strong><p className="peq sem-margem">{v}</p></div></Link>)}</div></Secao>

    <Colecao titulo="Títulos lidos" sub={`${S.n} ${S.n === 1 ? 'livro' : 'livros'}`} livros={comCapaPrimeiro(S.R)} />
    <Colecao titulo="Suas notas máximas" sub={`${S.cinco.length} ${S.cinco.length === 1 ? 'livro' : 'livros'}`} livros={comCapaPrimeiro(S.cinco)} limite={15} />
    <Colecao titulo="Suas decepções" sub="As notas mais baixas" livros={S.baixas} />
    <Colecao titulo="Parados na fila" sub={`${fila.length} ${fila.length === 1 ? 'livro' : 'livros'}`} livros={fila} />
    <Colecao titulo="Mudei de ideia" sub="Releituras com nota diferente" livros={mudeiDeIdeia(recorte.livros)} vazio="Quando uma releitura mudar sua nota, o livro aparece aqui." />
  </main>
}
