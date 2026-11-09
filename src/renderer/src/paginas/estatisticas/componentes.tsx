import type { Dispatch, ReactNode, SetStateAction } from 'react'
import { Link } from 'react-router-dom'
import type { LivroAnalise } from '@shared/api'
import {
  dec,
  type ChaveFiltro,
  type Contagem,
  type Estatisticas as DadosEstatisticas,
  type Filtros
} from '@shared/estatisticas'
import { Capa } from '../../componentes/Capa'
import { estrelasTexto } from '../../dados'

// Peças comuns dos gráficos da página Estatísticas.

/** O que toda seção recebe do painel: os números do recorte e os filtros ativos. */
export interface PropsSecao {
  S: DadosEstatisticas
  f: Filtros
  alterna: (k: ChaveFiltro, v: string | number) => void
  setF: Dispatch<SetStateAction<Filtros>>
}

export type Serie = DadosEstatisticas['series'][number]
export const COR = { roxo: '#A958D8', azul: '#2E9AC4', dourado: '#B28A1E', neutro: '#7D8C98' }
export const TIPOS: Record<string, string> = {
  livro: 'Livros',
  manhwa: 'Manhwas',
  manga: 'Mangás',
  graphic_novel: 'Graphic novels',
  poesia: 'Poesia'
}
export const FORMATOS: Record<string, string> = {
  fisico: 'Físico',
  ebook: 'E-book',
  audiolivro: 'Audiolivro',
  sem: 'Sem formato'
}
export const CLASSES: Record<string, string> = { sim: 'Ficção', nao: 'Não ficção', sem: 'Sem classificação' }
export const NOME_FILTRO: Record<ChaveFiltro, string> = {
  genero: 'Gênero',
  tema: 'Tema',
  mood: 'Mood',
  tipo: 'Tipo',
  formato: 'Formato',
  pais: 'País',
  status: 'Status',
  autor: 'Autor',
  mes: 'Mês',
  decada: 'Década',
  nota: 'Nota',
  classe: 'Classe'
}
export const opcoesDe = (lista: string[]): [string, string][] => [
  ['', 'Todos'],
  ...[...new Set(lista)].sort((a, b) => a.localeCompare(b, 'pt-BR')).map((v): [string, string] => [v, v])
]
export const anoCurto = (a: number | string) => `'${String(a).slice(2)}`
export const notaTexto = (n: number) => dec(n).replace(',0', '')

export function Coluna({
  titulo,
  rotulo,
  valor,
  altura,
  cor = COR.roxo,
  marcada,
  aoClicar
}: {
  titulo: string
  rotulo: string
  valor: number
  altura: number
  cor?: string
  marcada?: boolean
  aoClicar: () => void
}) {
  return (
    <button
      type="button"
      className={marcada ? 'est-coluna on' : 'est-coluna'}
      title={titulo}
      aria-label={`Filtrar ${titulo}`}
      aria-pressed={!!marcada}
      onClick={aoClicar}
    >
      <span>{valor}</span>
      <i style={{ height: altura, background: cor }} />
      <span className="muted">{rotulo}</span>
    </button>
  )
}

export function Ranking({
  titulo,
  cor,
  itens,
  ativo,
  aoClicar
}: {
  titulo: string
  cor: string
  itens: Contagem[]
  ativo?: string
  aoClicar: (v: string) => void
}) {
  const maximo = itens[0]?.[1] ?? 1
  return (
    <div className="card">
      <h3>{titulo}</h3>
      <div className="est-ranking">
        {itens.slice(0, 8).map(([nome, v]) => (
          <button
            key={nome}
            type="button"
            className={ativo === nome ? 'on peq' : 'peq'}
            aria-pressed={ativo === nome}
            onClick={() => aoClicar(nome)}
          >
            <span className="est-linha">
              <span>{TIPOS[nome] ?? nome}</span>
              <strong>{v}</strong>
            </span>
            <i style={{ width: `${Math.round((v / maximo) * 100)}%`, background: cor }} />
          </button>
        ))}
      </div>
      {!itens.length && <p className="muted peq">Nada neste recorte.</p>}
    </div>
  )
}

export function Rosca({
  titulo,
  itens
}: {
  titulo: string
  itens: { nome: string; v: number; cor: string; aoClicar: () => void }[]
}) {
  const total = itens.reduce((s, i) => s + i.v, 0)
  let soma = 0
  const fatias = itens.map((i) => {
    const ini = soma
    soma += i.v
    return `${i.cor} ${(ini / (total || 1)) * 100}% ${(soma / (total || 1)) * 100}%`
  })
  return (
    <div className="card">
      <h3>{titulo}</h3>
      <div className="est-rosca">
        <div
          role="img"
          aria-label={itens.map((i) => `${i.nome} ${i.v}`).join(', ')}
          style={{ background: total ? `conic-gradient(${fatias.join(',')})` : '#3D4D5A' }}
        >
          <span />
        </div>
        <div className="peq">
          {itens.map((i) => (
            <button key={i.nome} type="button" onClick={i.aoClicar}>
              <i style={{ background: i.cor }} />
              {i.nome}: <strong>{i.v}</strong>
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}

export function Colecao({
  titulo,
  sub,
  livros,
  vazio,
  limite = 30
}: {
  titulo: string
  sub: string
  livros: LivroAnalise[]
  vazio?: string
  limite?: number
}) {
  return (
    <section>
      <div className="sec">
        <h2>{titulo}</h2>
        <span className="muted peq">{sub}</span>
      </div>
      {livros.length ? (
        <div className="est-capas">
          {livros.slice(0, limite).map((l) => (
            <Link key={l.id} className="livro" to={`/livro/${l.id}`} title={l.titulo} aria-label={l.titulo}>
              <Capa livro={l} />
              <span className="nota peq">{estrelasTexto(l.nota)}</span>
            </Link>
          ))}
        </div>
      ) : (
        <p className="muted">{vazio ?? 'Nenhum livro neste recorte.'}</p>
      )}
    </section>
  )
}

export function Secao({ titulo, children }: { titulo: string; children: ReactNode }) {
  return (
    <section className="coluna">
      <div className="sec">
        <h2>{titulo}</h2>
      </div>
      {children}
    </section>
  )
}

export function tomCalor(v: number): [string, string] {
  return v >= 4.5
    ? ['#D5C7F5', '#150D26']
    : v >= 4.2
      ? ['#A98FE6', '#150D26']
      : v >= 3.9
        ? ['#6F54AE', '#FBF8FF']
        : ['#4A3A73', '#FBF8FF']
}
export const tomMapa = (n: number) =>
  n >= 40 ? '#D5C7F5' : n >= 20 ? '#A98FE6' : n >= 8 ? '#7258B4' : n > 0 ? '#4E3E78' : '#3D4D5A'
