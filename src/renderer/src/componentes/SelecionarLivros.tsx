import { useState } from 'react'
import type { LivroResumo } from '@shared/api'
import { Campo, ErroFormulario } from './Formulario'
import { Capa } from './Capa'
import { normalizar } from '../dados'

export function moverItem<T>(lista: T[], indice: number, delta: number): T[] {
  const nova = [...lista]
  const destino = indice + delta
  if (destino < 0 || destino >= nova.length) return nova
  ;[nova[indice], nova[destino]] = [nova[destino], nova[indice]]
  return nova
}
export function SelecionarLivros({
  titulo,
  livros,
  iniciais = [],
  limite = 10000,
  ordenavel = false,
  salvando,
  erro,
  aoSalvar,
  aoFechar
}: {
  titulo: string
  livros: LivroResumo[]
  iniciais?: number[]
  limite?: number
  ordenavel?: boolean
  salvando: boolean
  erro?: unknown
  aoSalvar: (ids: number[]) => void
  aoFechar: () => void
}) {
  const [busca, setBusca] = useState('')
  const [ids, setIds] = useState(iniciais)
  const termo = normalizar(busca)
  // Os já selecionados vêm primeiro.
  const resultados = livros
    .filter((l) => normalizar(`${l.titulo} ${l.autores.map((a) => a.nome).join(' ')}`).includes(termo))
    .sort((a, b) => Number(ids.includes(b.id)) - Number(ids.includes(a.id)))
  return (
    <section className="card coluna seletor-livros" aria-label={titulo}>
      <div className="cabeca">
        <h3>{titulo}</h3>
        <span className="muted peq">
          {ids.length} selecionados{limite < 10000 ? ` de ${limite}` : ''}
        </span>
      </div>
      {ordenavel && !!ids.length && (
        <ol className="selecao-ordem">
          {ids.map((id, i) => (
            <li key={id}>
              <span>{livros.find((l) => l.id === id)?.titulo}</span>
              <button
                type="button"
                className="btn btn2 pequeno"
                aria-label={`Subir favorito ${i + 1}`}
                disabled={!i || salvando}
                onClick={() => setIds(moverItem(ids, i, -1))}
              >
                ↑
              </button>
              <button
                type="button"
                className="btn btn2 pequeno"
                aria-label={`Descer favorito ${i + 1}`}
                disabled={i === ids.length - 1 || salvando}
                onClick={() => setIds(moverItem(ids, i, 1))}
              >
                ↓
              </button>
              <button
                type="button"
                className="btn btn2 pequeno"
                aria-label={`Remover favorito ${i + 1}`}
                disabled={salvando}
                onClick={() => setIds(ids.filter((x) => x !== id))}
              >
                ×
              </button>
            </li>
          ))}
        </ol>
      )}
      <Campo
        rotulo="Buscar livros para selecionar"
        type="search"
        value={busca}
        onChange={(e) => setBusca(e.target.value)}
      />
      <div className="seletor-resultados">
        {resultados.map((l) => (
          <button
            className={`selecionar-livro ${ids.includes(l.id) ? 'on' : ''}`}
            type="button"
            key={l.id}
            aria-pressed={ids.includes(l.id)}
            aria-label={`Selecionar ${l.titulo}`}
            disabled={salvando || (!ids.includes(l.id) && ids.length >= limite)}
            onClick={() => setIds((ids) => (ids.includes(l.id) ? ids.filter((id) => id !== l.id) : [...ids, l.id]))}
          >
            <Capa livro={l} />
            <span>
              <strong>{l.titulo}</strong>
              <span className="muted peq">{l.autores.map((a) => a.nome).join(', ')}</span>
            </span>
            <span className="selecao-marca">{ids.includes(l.id) ? '✓' : '+'}</span>
          </button>
        ))}
      </div>
      {!resultados.length && <p className="muted">Nenhum livro encontrado.</p>}
      <ErroFormulario erro={erro} />
      <div className="linha">
        <button type="button" className="btn" disabled={salvando} onClick={() => aoSalvar(ids)}>
          {salvando ? 'Salvando…' : 'Salvar seleção'}
        </button>
        <button type="button" className="btn btn2" disabled={salvando} onClick={aoFechar}>
          Cancelar
        </button>
      </div>
    </section>
  )
}
