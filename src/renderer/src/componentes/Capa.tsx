import { useState, type CSSProperties } from 'react'
import { Link } from 'react-router-dom'
import type { LivroResumo } from '@shared/api'
import { coresDoLivro, estrelasTexto, NOME_STATUS } from '../dados'

export function Capa({
  livro,
  grande = false,
  imediata = false
}: {
  livro: LivroResumo
  grande?: boolean
  imediata?: boolean
}) {
  const [falhou, setFalhou] = useState(false)
  const origem = grande ? (livro.capa ?? livro.miniatura) : (livro.miniatura ?? livro.capa)
  const cores = coresDoLivro(livro)

  if (origem && !falhou) {
    return (
      <img className="capa" src={origem} alt="" loading={imediata ? 'eager' : 'lazy'} onError={() => setFalhou(true)} />
    )
  }
  return <CapaDesenhada className="capa" titulo={livro.titulo} cor={cores.fundo} />
}

/** Capa desenhada para livros sem imagem: a cor do livro, moldura, círculo e uma faixa com o título. */
export function CapaDesenhada({
  titulo,
  cor,
  className = '',
  style
}: {
  titulo: string
  cor: string
  className?: string
  style?: CSSProperties
}) {
  return (
    <div className={`${className} semcapa`} style={{ ...style, background: cor }}>
      <span className="semcapa-circulo" aria-hidden="true" />
      <span className="semcapa-faixa">{titulo}</span>
    </div>
  )
}

export function CartaoLivro({
  livro,
  aoClicar,
  marcado
}: {
  livro: LivroResumo
  aoClicar?: () => void
  marcado?: boolean
}) {
  const conteudo = (
    <>
      <Capa livro={livro} />
      <span className="livro-titulo">{livro.titulo}</span>
      <span className="nota peq">
        {livro.status === 'lido' ? estrelasTexto(livro.nota) : NOME_STATUS[livro.status]}
      </span>
    </>
  )
  if (aoClicar) {
    return (
      <button
        type="button"
        className={marcado ? 'livro livro-botao marcado' : 'livro livro-botao'}
        aria-pressed={marcado}
        onClick={aoClicar}
      >
        {conteudo}
      </button>
    )
  }
  return (
    <Link className="livro" to={`/livro/${livro.id}`} title={livro.titulo}>
      {conteudo}
    </Link>
  )
}

export function Estado({ carregando, erro, aoTentar }: { carregando: boolean; erro: boolean; aoTentar: () => void }) {
  if (carregando) return <p className="wrap estado muted">Carregando seus livros...</p>
  if (erro) {
    return (
      <div className="wrap estado" role="alert">
        <p>Não foi possível carregar seus livros.</p>
        <button type="button" className="btn" onClick={aoTentar}>
          Tentar de novo
        </button>
      </div>
    )
  }
  return null
}
