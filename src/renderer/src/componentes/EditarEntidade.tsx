import { useState, type FormEvent } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import type { DadosEntidade, Entidade, TipoEntidade } from '@shared/api'
import { useSalvar } from '../dados'
import { Campo, ErroFormulario, EscolhaPais } from './Formulario'

const ROTA: Record<TipoEntidade, string> = { autor: 'autor', editora: 'editora', serie: 'serie' }
const NOME: Record<TipoEntidade, string> = { autor: 'autoria', editora: 'editora', serie: 'série' }

// Renomear, corrigir país ou total de volumes e mesclar com um registro de mesmo nome.
export function EditarEntidade({ tipo, id }: { tipo: TipoEntidade; id: number }) {
  const [aberto, setAberto] = useState(false)
  const entidade = useQuery({
    queryKey: ['livros', 'entidade', tipo, id],
    queryFn: () => window.bela.autoria.obter(tipo, id),
    enabled: aberto
  })
  if (!aberto)
    return (
      <button type="button" className="btn btn2 pequeno" onClick={() => setAberto(true)}>
        Editar {NOME[tipo]}
      </button>
    )
  if (!entidade.data)
    return <p className="muted peq">{entidade.isError ? 'Não foi possível carregar os dados.' : 'Carregando…'}</p>
  return <Formulario key={entidade.data.id} tipo={tipo} entidade={entidade.data} aoFechar={() => setAberto(false)} />
}

function Formulario({ tipo, entidade, aoFechar }: { tipo: TipoEntidade; entidade: Entidade; aoFechar: () => void }) {
  const navegar = useNavigate()
  const [dados, setDados] = useState<DadosEntidade>({
    nome: entidade.nome,
    pais: entidade.pais,
    totalVolumes: entidade.totalVolumes
  })
  const salvar = useSalvar((d: { dados: DadosEntidade; mesclar: boolean }) =>
    window.bela.autoria.editar(tipo, entidade.id, d.dados, d.mesclar)
  )
  async function enviar(e: FormEvent, mesclar = false) {
    e.preventDefault()
    try {
      const resultado = await salvar.mutateAsync({ dados, mesclar })
      if (resultado.existente) {
        if (
          window.confirm(
            `Já existe "${resultado.existente.nome}". Juntar os dois? Os livros passam para "${resultado.existente.nome}" e este registro deixa de existir.`
          )
        )
          await enviar(e, true)
        return
      }
      aoFechar()
      if (resultado.id !== entidade.id) navegar(`/${ROTA[tipo]}/${resultado.id}`, { replace: true })
    } catch {
      /* A mensagem aparece no formulário. */
    }
  }
  return (
    <form className="card coluna editar-entidade" onSubmit={(e) => void enviar(e)} aria-label={`Editar ${NOME[tipo]}`}>
      <Campo
        rotulo="Nome"
        required
        maxLength={300}
        value={dados.nome}
        onChange={(e) => setDados((d) => ({ ...d, nome: e.target.value }))}
      />
      {tipo !== 'serie' ? (
        <EscolhaPais
          rotulo={tipo === 'autor' ? 'País da autoria' : 'País da editora'}
          valor={dados.pais ?? null}
          aoMudar={(pais) => setDados((d) => ({ ...d, pais }))}
        />
      ) : (
        <Campo
          rotulo="Total de volumes da série"
          type="number"
          min="1"
          value={dados.totalVolumes ?? ''}
          onChange={(e) => setDados((d) => ({ ...d, totalVolumes: e.target.value ? Number(e.target.value) : null }))}
        />
      )}
      <p className="muted peq sem-margem">
        Se o nome já existir, você pode juntar os dois registros (por exemplo, duas grafias da mesma pessoa).
      </p>
      <ErroFormulario erro={salvar.error} />
      <div className="linha">
        <button className="btn" disabled={salvar.isPending}>
          {salvar.isPending ? 'Salvando…' : 'Salvar'}
        </button>
        <button type="button" className="btn btn2" onClick={aoFechar}>
          Cancelar
        </button>
      </div>
    </form>
  )
}
