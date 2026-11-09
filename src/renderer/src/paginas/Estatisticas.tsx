import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import type { BaseAnalise } from '@shared/api'
import {
  calcular,
  comCapaPrimeiro,
  dec,
  filaMaisAntiga,
  filtrar,
  fmt,
  MESES_LONGOS,
  mudeiDeIdeia,
  type ChaveFiltro,
  type Filtros
} from '@shared/estatisticas'
import { Capa, Estado } from '../componentes/Capa'
import { Escolha } from '../componentes/Formulario'
import { NOME_STATUS, useAnalise } from '../dados'
import { CLASSES, Colecao, COR, FORMATOS, NOME_FILTRO, notaTexto, opcoesDe, TIPOS } from './estatisticas/componentes'
import { AoLongoDoTempo } from './estatisticas/AoLongoDoTempo'
import { PerfilDeLeitura } from './estatisticas/PerfilDeLeitura'
import { AutoresESeries } from './estatisticas/AutoresESeries'
import { MetasEPlanejamento, Recordes } from './estatisticas/MetasERecordes'

export function Estatisticas() {
  const consulta = useAnalise()
  if (!consulta.data)
    return <Estado carregando={consulta.isLoading} erro={consulta.isError} aoTentar={() => void consulta.refetch()} />
  return <Painel base={consulta.data} />
}

function Painel({ base }: { base: BaseAnalise }) {
  const [ano, setAno] = useState('')
  const [f, setF] = useState<Filtros>({})
  // Fixo durante a vida da página, para os cálculos memorizados não mudarem a cada renderização.
  const [hoje] = useState(() => new Date())
  const a = ano ? Number(ano) : null
  const recorte = useMemo(() => filtrar(base.livros, f), [base, f])
  const S = useMemo(() => calcular(recorte, a, hoje), [recorte, a, hoje])

  const alterna = (k: ChaveFiltro, v: string | number) =>
    setF((atual) => {
      const novo = { ...atual }
      if (novo[k] === String(v)) delete novo[k]
      else novo[k] = String(v)
      return novo
    })
  const define = (k: ChaveFiltro) => (v: string) =>
    setF((atual) => {
      const novo = { ...atual }
      if (v) novo[k] = v
      else delete novo[k]
      return novo
    })
  const rotulo = (k: ChaveFiltro, v: string) =>
    k === 'mes'
      ? MESES_LONGOS[Number(v) - 1]
      : k === 'nota'
        ? `${notaTexto(Number(v))} estrelas`
        : k === 'decada'
          ? `anos ${v}`
          : k === 'status'
            ? NOME_STATUS[v as keyof typeof NOME_STATUS]
            : k === 'formato'
              ? FORMATOS[v]
              : k === 'classe'
                ? CLASSES[v]
                : k === 'tipo'
                  ? TIPOS[v]
                  : k === 'autor'
                    ? (base.livros.flatMap((l) => l.autores).find((x) => String(x.id) === v)?.nome ?? v)
                    : v

  const chaves = Object.keys(f) as ChaveFiltro[]
  const doFiltro = f.status && f.status !== 'lido' ? recorte.livros : S.R
  const anosTodos = [
    ...new Set(base.livros.flatMap((l) => l.leituras.flatMap((x) => (x.ano === null ? [] : [x.ano]))))
  ].sort((x, y) => y - x)
  const statusB = (['lido', 'lendo', 'quero_ler', 'pausado', 'abandonado'] as const).map((s, i) => ({
    s,
    v: recorte.livros.filter((l) => l.status === s).length,
    c: [COR.roxo, COR.azul, COR.dourado, COR.neutro, '#B9C3C9'][i]
  }))
  const fila = filaMaisAntiga(recorte.livros)
  const selects: [ChaveFiltro, string[]][] = [
    ['genero', base.livros.flatMap((l) => l.generos)],
    ['tema', base.livros.flatMap((l) => l.temas)],
    ['mood', base.livros.flatMap((l) => l.moods)],
    ['pais', base.livros.flatMap((l) => (l.pais ? [l.pais] : []))]
  ]
  const ritmo: [string, string][] = [
    [dec(S.livrosPorAno), 'livros por ano'],
    [dec(S.livrosPorAno / 12), 'livros por mês'],
    [dec(S.livrosPorDia, 2), 'livros por dia'],
    [fmt(Math.round(S.paginasPorAno)), 'páginas por ano'],
    [fmt(Math.round(S.paginasPorAno / 12)), 'páginas por mês'],
    [dec(S.paginasPorDia), 'páginas por dia'],
    [fmt(Math.round(S.diasPorLivro)), 'dias por livro']
  ]
  return (
    <main className="wrap pagina estatisticas">
      <section className="coluna">
        <div className="cabeca">
          <h1>Sua vida em livros</h1>
          <div className="linha est-periodo">
            <Escolha
              rotulo="Período"
              valor={ano}
              aoMudar={setAno}
              opcoes={[['', 'Todo o período'], ...anosTodos.map((x): [string, string] => [String(x), String(x)])]}
            />
            <Link className="btn btn2" to={`/retrospectiva${a ? `?ano=${a}` : ''}`}>
              Ver retrospectiva
            </Link>
          </div>
        </div>
        <div className="est-filtros">
          {selects.map(([k, lista]) => (
            <Escolha key={k} rotulo={NOME_FILTRO[k]} valor={f[k] ?? ''} aoMudar={define(k)} opcoes={opcoesDe(lista)} />
          ))}
          <Escolha
            rotulo="Tipo"
            valor={f.tipo ?? ''}
            aoMudar={define('tipo')}
            opcoes={[['', 'Todos'], ...Object.entries(TIPOS)]}
          />
          <Escolha
            rotulo="Formato"
            valor={f.formato ?? ''}
            aoMudar={define('formato')}
            opcoes={[
              ['', 'Todos'],
              ['fisico', 'Físico'],
              ['ebook', 'E-book'],
              ['audiolivro', 'Audiolivro']
            ]}
          />
        </div>
        <p className="peq muted sem-margem">
          Clique em uma barra, fatia, país ou autor para filtrar todos os gráficos.
        </p>
        {chaves.length > 0 && (
          <div className="card est-filtrado">
            <div className="linha">
              <strong>
                {doFiltro.length} {doFiltro.length === 1 ? 'livro' : 'livros'}
              </strong>
              {chaves.map((k) => (
                <button
                  key={k}
                  type="button"
                  className="btn btn2 pequeno"
                  aria-label={`Remover filtro ${NOME_FILTRO[k]}: ${rotulo(k, f[k]!)}`}
                  onClick={() => alterna(k, f[k]!)}
                >
                  {NOME_FILTRO[k]}: {rotulo(k, f[k]!)} ×
                </button>
              ))}
              <button type="button" className="link est-limpar" onClick={() => setF({})}>
                Limpar filtros
              </button>
            </div>
            <div className="est-capas mini">
              {comCapaPrimeiro(doFiltro)
                .slice(0, 24)
                .map((l) => (
                  <Link key={l.id} className="livro" to={`/livro/${l.id}`} title={l.titulo} aria-label={l.titulo}>
                    <Capa livro={l} />
                  </Link>
                ))}
            </div>
          </div>
        )}
        <div className="est-kpis">
          {(
            [
              [S.n, 'livros lidos'],
              [fmt(S.paginas), 'páginas lidas'],
              [S.autoresTotal, 'autores diferentes'],
              [dec(S.media), 'nota média'],
              [S.resenhas, 'resenhas'],
              [S.cinco.length, 'livros com 5 estrelas']
            ] as const
          ).map(([v, n], i) => (
            <div className={i === 0 ? 'card alto' : 'card'} key={n}>
              <p className="num sem-margem">{v}</p>
              <p className="peq muted sem-margem">{n}</p>
            </div>
          ))}
        </div>
        <div className="est-grade g320">
          <div className="card">
            <h3>Biblioteca por status</h3>
            <div
              className="est-status"
              role="group"
              aria-label={statusB.map((s) => `${NOME_STATUS[s.s]} ${s.v}`).join(', ')}
            >
              {statusB.map((s) => (
                <button
                  key={s.s}
                  type="button"
                  title={`${NOME_STATUS[s.s]}: ${s.v}`}
                  aria-label={`Filtrar ${NOME_STATUS[s.s]}: ${s.v}`}
                  onClick={() => alterna('status', s.s)}
                  style={{ flex: `${s.v} 1 0`, minWidth: s.v ? 5 : 0, background: s.c }}
                />
              ))}
            </div>
            <div className="linha peq est-legenda">
              {statusB.map((s) => (
                <span key={s.s}>
                  <i style={{ background: s.c }} />
                  {NOME_STATUS[s.s]} <strong>{s.v}</strong>
                </span>
              ))}
            </div>
          </div>
          <div className="card">
            <h3>Ritmo</h3>
            <div className="est-ritmo">
              {ritmo.map(([v, n]) => (
                <div key={n}>
                  <p className="num sem-margem">{v}</p>
                  <p className="peq muted sem-margem">{n}</p>
                </div>
              ))}
            </div>
            <p className="peq muted">Só considera leituras com ano registrado.</p>
          </div>
        </div>
      </section>

      <AoLongoDoTempo S={S} f={f} alterna={alterna} setF={setF} ano={a} aoMudarAno={setAno} />
      <PerfilDeLeitura S={S} f={f} alterna={alterna} setF={setF} />
      <AutoresESeries S={S} f={f} alterna={alterna} setF={setF} />
      <MetasEPlanejamento base={base} recorte={recorte} hoje={hoje} />
      <Recordes S={S} recorte={recorte} />

      <Colecao titulo="Títulos lidos" sub={`${S.n} ${S.n === 1 ? 'livro' : 'livros'}`} livros={comCapaPrimeiro(S.R)} />
      <Colecao
        titulo="Suas notas máximas"
        sub={`${S.cinco.length} ${S.cinco.length === 1 ? 'livro' : 'livros'}`}
        livros={comCapaPrimeiro(S.cinco)}
        limite={15}
      />
      <Colecao titulo="Suas decepções" sub="As notas mais baixas" livros={S.baixas} />
      <Colecao
        titulo="Parados na fila"
        sub={`${fila.length} ${fila.length === 1 ? 'livro' : 'livros'}`}
        livros={fila}
      />
      <Colecao
        titulo="Mudei de ideia"
        sub="Releituras com nota diferente"
        livros={mudeiDeIdeia(recorte.livros)}
        vazio="Quando uma releitura mudar sua nota, o livro aparece aqui."
      />
    </main>
  )
}
