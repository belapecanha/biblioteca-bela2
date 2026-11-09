import { useState } from 'react'
import { Link } from 'react-router-dom'
import type { LivroResumo } from '@shared/api'
import { ErroFormulario, Escolha } from './Formulario'
import { useListas, usePainelPerfil, useSalvar } from '../dados'

export function OrganizarLivro({ livro }: { livro: LivroResumo }) {
  const painel = usePainelPerfil()
  const listas = useListas()
  const [lista, setLista] = useState('')
  const favorito = useSalvar(async () => {
    if (!painel.data) throw new Error('Aguarde o carregamento do perfil.')
    const ids = painel.data.favoritos.map((l) => l.id)
    if (!ids.includes(livro.id) && ids.length >= 4)
      throw new Error('Os quatro lugares já estão ocupados. Escolha quais favoritos manter no Perfil.')
    await window.bela.perfil.favoritos(
      ids.includes(livro.id) ? ids.filter((id) => id !== livro.id) : [...ids, livro.id]
    )
  })
  const fila = useSalvar(async () => {
    if (!painel.data) throw new Error('Aguarde o carregamento do perfil.')
    const ids = painel.data.fila.map((l) => l.id)
    await window.bela.perfil.fila(ids.includes(livro.id) ? ids.filter((id) => id !== livro.id) : [...ids, livro.id])
  })
  const adicionar = useSalvar((id: number) => window.bela.listas.adicionar(id, [livro.id]))
  return (
    <div className="card coluna">
      <span className="rot">Organizar</span>
      {(livro.status === 'lido' || livro.favorito) && (
        <>
          <button
            className="btn btn2"
            type="button"
            disabled={!painel.data || favorito.isPending}
            onClick={() => favorito.mutate()}
          >
            {livro.favorito ? 'Retirar dos favoritos' : 'Adicionar aos favoritos'}
          </button>
          <Link className="link peq" to="/perfil">
            Ver favoritos no perfil
          </Link>
        </>
      )}
      {livro.status === 'quero_ler' && (
        <button
          className="btn btn2"
          type="button"
          disabled={!painel.data || fila.isPending}
          onClick={() => fila.mutate()}
        >
          {painel.data?.fila.some((l) => l.id === livro.id) ? 'Retirar da fila da meta' : 'Colocar na fila da meta'}
        </button>
      )}
      <Escolha
        rotulo="Adicionar a uma lista"
        valor={lista}
        aoMudar={setLista}
        opcoes={[['', 'Escolher lista'], ...(listas.data ?? []).map((l): [string, string] => [String(l.id), l.nome])]}
      />
      <button
        className="btn btn2"
        type="button"
        disabled={!lista || adicionar.isPending}
        onClick={() => adicionar.mutate(Number(lista))}
      >
        Adicionar à lista
      </button>
      {adicionar.isSuccess && (
        <p className="sucesso peq sem-margem" role="status">
          Livro adicionado à lista.
        </p>
      )}
      <Link className="link peq" to="/listas">
        Criar ou abrir listas
      </Link>
      <ErroFormulario erro={favorito.error || adicionar.error || fila.error || painel.error || listas.error} />
    </div>
  )
}
