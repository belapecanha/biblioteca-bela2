import { useMemo, useState } from 'react'
import type { LivroResumo, Posse, Status } from '@shared/api'
import { CartaoLivro, Estado } from '../componentes/Capa'
import { contar, NOME_STATUS, nomesAutores, normalizar, useAcoesLivro, useLivros } from '../dados'

const INICIAIS = {
  busca: '',
  genero: '',
  tema: '',
  mood: '',
  autor: '',
  serie: '',
  nota: '',
  ano: '',
  formato: '',
  posse: '',
  ordem: 'titulo'
}
const PASSO = 60

const ORDENS: Record<string, (a: LivroResumo, b: LivroResumo) => number> = {
  titulo: (a, b) => a.titulo.localeCompare(b.titulo, 'pt-BR'),
  recente: (a, b) => (b.dataLida ?? String(b.anoLido ?? '')).localeCompare(a.dataLida ?? String(a.anoLido ?? '')),
  nota: (a, b) => (b.nota ?? 0) - (a.nota ?? 0),
  paginas: (a, b) => (b.paginas ?? 0) - (a.paginas ?? 0)
}

export function Livros() {
  const consulta = useLivros()
  const acoes = useAcoesLivro()
  const [status, setStatus] = useState<Status | ''>('')
  const [f, setF] = useState(INICIAIS)
  const [limite, setLimite] = useState(PASSO)
  const [selecionando, setSelecionando] = useState(false)
  const [marcados, setMarcados] = useState<Set<number>>(new Set())
  const livros = useMemo(() => consulta.data ?? [], [consulta.data])

  const opcoes = useMemo(() => {
    const nomes = (lista: string[]) => contar(lista).map(([n]) => n)
    return {
      genero: nomes(livros.flatMap((l) => l.generos)),
      tema: nomes(livros.flatMap((l) => l.temas)),
      mood: nomes(livros.flatMap((l) => l.moods)),
      autor: nomes(livros.flatMap((l) => l.autores.map((a) => a.nome))),
      serie: nomes(livros.flatMap((l) => (l.serie ? [l.serie.nome] : []))),
      ano: [...new Set(livros.flatMap((l) => (l.anoLido ? [l.anoLido] : [])))].sort((a, b) => b - a).map(String)
    }
  }, [livros])

  const filtrados = useMemo(() => {
    const termo = normalizar(f.busca.trim())
    return livros
      .filter(
        (l) =>
          (!status || l.status === status) &&
          (!termo || normalizar(`${l.titulo} ${nomesAutores(l)} ${l.serie?.nome ?? ''}`).includes(termo)) &&
          (!f.genero || l.generos.includes(f.genero)) &&
          (!f.tema || l.temas.includes(f.tema)) &&
          (!f.mood || l.moods.includes(f.mood)) &&
          (!f.autor || l.autores.some((a) => a.nome === f.autor)) &&
          (!f.serie || l.serie?.nome === f.serie) &&
          (!f.nota || (l.nota ?? 0) >= Number(f.nota)) &&
          (!f.ano || l.anoLido === Number(f.ano)) &&
          (!f.formato || l.formato === f.formato) &&
          (!f.posse || (f.posse === 'definir' ? !l.posse : l.posse === f.posse))
      )
      .sort(ORDENS[f.ordem])
  }, [livros, status, f])

  if (!consulta.data)
    return <Estado carregando={consulta.isLoading} erro={consulta.isError} aoTentar={() => void consulta.refetch()} />

  const mudar = (campo: keyof typeof INICIAIS) => (e: { target: { value: string } }) => {
    setF({ ...f, [campo]: e.target.value })
    setLimite(PASSO)
  }
  const seletor = (campo: keyof typeof INICIAIS, rotulo: string, lista: string[]) => (
    <div>
      <label className="rot" htmlFor={`f-${campo}`}>
        {rotulo}
      </label>
      <select id={`f-${campo}`} className="campo larga" value={f[campo]} onChange={mudar(campo)}>
        <option value="">Todos</option>
        {lista.map((o) => (
          <option key={o} value={o}>
            {o}
          </option>
        ))}
      </select>
    </div>
  )
  const alternar = (id: number) => {
    const novo = new Set(marcados)
    if (novo.has(id)) novo.delete(id)
    else novo.add(id)
    setMarcados(novo)
  }
  const marcarPosse = (posse: Posse) => {
    acoes.posse.mutate(
      { ids: [...marcados], posse },
      {
        onSuccess: () => {
          setMarcados(new Set())
          setSelecionando(false)
        }
      }
    )
  }
  const abas: [Status | '', string][] = [['', 'Todos'], ...(Object.entries(NOME_STATUS) as [Status, string][])]

  return (
    <main className="wrap pagina">
      <h1>{filtrados.length} livros</h1>
      <div className="linha" role="group" aria-label="Status">
        {abas.map(([v, n]) => (
          <button
            type="button"
            key={v}
            className={status === v ? 'btn btn2 on' : 'btn btn2'}
            aria-pressed={status === v}
            onClick={() => {
              setStatus(v)
              setLimite(PASSO)
            }}
          >
            {n} ({v ? livros.filter((l) => l.status === v).length : livros.length})
          </button>
        ))}
      </div>
      <div className="filtros">
        <div>
          <label className="rot" htmlFor="f-busca">
            Filtrar por texto
          </label>
          <input id="f-busca" className="campo larga" type="search" value={f.busca} onChange={mudar('busca')} />
        </div>
        {seletor('genero', 'Gênero', opcoes.genero)}
        {seletor('tema', 'Tema', opcoes.tema)}
        {seletor('mood', 'Mood', opcoes.mood)}
        {seletor('autor', 'Autor', opcoes.autor)}
        {seletor('serie', 'Série', opcoes.serie)}
        {seletor('ano', 'Ano lido', opcoes.ano)}
        <div>
          <label className="rot" htmlFor="f-nota">
            Nota mínima
          </label>
          <select id="f-nota" className="campo larga" value={f.nota} onChange={mudar('nota')}>
            <option value="">Todas</option>
            {['3', '3.5', '4', '4.5', '5'].map((n) => (
              <option key={n} value={n}>
                {n.replace('.', ',')}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="rot" htmlFor="f-formato">
            Formato
          </label>
          <select id="f-formato" className="campo larga" value={f.formato} onChange={mudar('formato')}>
            <option value="">Todos</option>
            <option value="fisico">Físico</option>
            <option value="ebook">E-book</option>
            <option value="audiolivro">Audiolivro</option>
          </select>
        </div>
        <div>
          <label className="rot" htmlFor="f-posse">
            Posse
          </label>
          <select id="f-posse" className="campo larga" value={f.posse} onChange={mudar('posse')}>
            <option value="">Todos</option>
            <option value="definir">A definir</option>
            <option value="tenho">Tenho</option>
            <option value="nao_tenho">Não tenho</option>
            <option value="ja_tive">Já tive</option>
          </select>
        </div>
        <div>
          <label className="rot" htmlFor="f-ordem">
            Ordenar por
          </label>
          <select id="f-ordem" className="campo larga" value={f.ordem} onChange={mudar('ordem')}>
            <option value="titulo">Título</option>
            <option value="recente">Lidos há menos tempo</option>
            <option value="nota">Maior nota</option>
            <option value="paginas">Mais páginas</option>
          </select>
        </div>
      </div>
      <div className="linha centrada">
        <button
          type="button"
          className={selecionando ? 'btn btn2 on' : 'btn btn2'}
          aria-pressed={selecionando}
          onClick={() => {
            setSelecionando(!selecionando)
            setMarcados(new Set())
          }}
        >
          {selecionando ? 'Cancelar seleção' : 'Selecionar vários'}
        </button>
        {selecionando && (
          <>
            <span role="status">{marcados.size} selecionados</span>
            <button type="button" className="btn btn2" onClick={() => setMarcados(new Set(filtrados.map((l) => l.id)))}>
              Selecionar os filtrados
            </button>
            <button type="button" className="btn" disabled={!marcados.size} onClick={() => marcarPosse('tenho')}>
              Marcar como Tenho
            </button>
            <button
              type="button"
              className="btn btn2"
              disabled={!marcados.size}
              onClick={() => marcarPosse('nao_tenho')}
            >
              Não tenho
            </button>
            <button type="button" className="btn btn2" disabled={!marcados.size} onClick={() => marcarPosse('ja_tive')}>
              Já tive
            </button>
          </>
        )}
      </div>
      {acoes.posse.isError && (
        <p className="erro" role="alert">
          Não foi possível salvar. Tente de novo.
        </p>
      )}
      {filtrados.length === 0 && <p className="muted">Nenhum livro com esses filtros.</p>}
      <div className="grade">
        {filtrados.slice(0, limite).map((l) => (
          <CartaoLivro
            key={l.id}
            livro={l}
            marcado={marcados.has(l.id)}
            aoClicar={selecionando ? () => alternar(l.id) : undefined}
          />
        ))}
      </div>
      {filtrados.length > limite && (
        <button type="button" className="btn btn2 meio" onClick={() => setLimite(limite + PASSO)}>
          Mostrar mais {Math.min(PASSO, filtrados.length - limite)} livros
        </button>
      )}
    </main>
  )
}
