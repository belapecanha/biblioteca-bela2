import { Link } from 'react-router-dom'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import type { BaseAnalise } from '@shared/api'
import {
  fmt,
  metaDoAno,
  tempoNaFila,
  filaMaisAntiga,
  type Estatisticas as DadosEstatisticas,
  type Recorte
} from '@shared/estatisticas'
import { Capa } from '../../componentes/Capa'
import { mensagemErro } from '../../dados'
import { Secao } from './componentes'

export function MetasEPlanejamento({ base, recorte, hoje }: { base: BaseAnalise; recorte: Recorte; hoje: Date }) {
  const cliente = useQueryClient()
  const anoAtual = hoje.getFullYear()
  const salvarMeta = useMutation({
    mutationFn: (livros: number | null) => window.bela.analise.definirMeta(anoAtual, livros),
    onSuccess: () => {
      void cliente.invalidateQueries({ queryKey: ['livros', 'analise'] })
      void cliente.invalidateQueries({ queryKey: ['perfil'] })
    }
  })
  const naFila = tempoNaFila(recorte.livros)
  const metaValor = base.metas[anoAtual] ?? null
  const meta = metaDoAno(base.livros, anoAtual, hoje)
  const tenho = recorte.livros.filter((l) => l.posse === 'tenho')
  return (
    <Secao titulo="Metas e planejamento">
      <div className="est-grade g240">
        <div className="card alto">
          <h3>Meta de {anoAtual}</h3>
          <p className="num est-meta">
            {metaValor ? `${meta.lidos} de ${metaValor}` : `${meta.lidos} ${meta.lidos === 1 ? 'livro' : 'livros'}`}
          </p>
          {metaValor !== null && (
            <div
              className="est-progresso"
              role="img"
              aria-label={`${Math.min(100, Math.round((meta.lidos / metaValor) * 100))}%`}
            >
              <i style={{ width: `${Math.min(100, Math.round((meta.lidos / metaValor) * 100))}%` }} />
            </div>
          )}
          <div className="linha est-meta-campo">
            <label className="rot sem-margem" htmlFor="meta-ano">
              Meta
            </label>
            <input
              id="meta-ano"
              key={metaValor ?? 'vazia'}
              className="campo"
              type="number"
              min="1"
              defaultValue={metaValor ?? ''}
              onKeyDown={(e) => {
                if (e.key === 'Enter') e.currentTarget.blur()
              }}
              onBlur={(e) => {
                const v = e.target.value ? Number(e.target.value) : null
                if (v !== metaValor && (v === null || (Number.isInteger(v) && v > 0))) salvarMeta.mutate(v)
              }}
            />
          </div>
          {salvarMeta.isError && (
            <p className="erro peq" role="alert">
              {mensagemErro(salvarMeta.error)}
            </p>
          )}
          <p className="peq sem-margem">
            {metaValor
              ? `Faltam ${Math.max(0, metaValor - meta.lidos)} em ${meta.diasRestantes} dias.`
              : 'Defina quantos livros quer ler neste ano.'}
          </p>
        </div>
        <div className="card">
          <h3>Previsão para {anoAtual}</h3>
          <p className="num est-meta">
            {meta.previsao} {meta.previsao === 1 ? 'livro' : 'livros'}
          </p>
          <p className="peq muted sem-margem">no ritmo atual do ano</p>
        </div>
        <div className="card">
          <h3>Tempo na fila</h3>
          {naFila ? (
            <>
              <p className="num est-meta">{Math.round(naFila.media)} dias</p>
              <p className="peq muted sem-margem">
                em média · menor {naFila.menor}, maior {naFila.maior} · {naFila.n} {naFila.n === 1 ? 'livro' : 'livros'}
              </p>
            </>
          ) : (
            <p className="peq muted">
              Tempo médio, menor e maior espera entre adicionar e começar. Começa a contar nos próximos livros
              adicionados, porque sua lista foi importada de uma vez.
            </p>
          )}
        </div>
        <div className="card">
          <h3>Biblioteca própria</h3>
          <p className="num est-meta">{tenho.length}</p>
          <p className="peq muted sem-margem">
            livros marcados como seus, {tenho.filter((l) => l.status === 'lido').length} já lidos
          </p>
        </div>
      </div>
    </Secao>
  )
}

export function Recordes({ S, recorte }: { S: DadosEstatisticas; recorte: Recorte }) {
  const fila = filaMaisAntiga(recorte.livros)
  const antigo = fila.find((l) => l.origem === 'manual')
  return (
    <Secao titulo="Recordes">
      <div className="est-grade g280">
        {(
          [
            ['Mais longo', S.maior, S.maior && `${fmt(S.maior.paginas ?? 0)} páginas`],
            ['Mais curto', S.menor, S.menor && `${fmt(S.menor.paginas ?? 0)} páginas`],
            [
              'Há mais tempo na fila',
              antigo ?? fila[0] ?? null,
              antigo
                ? `Desde ${new Date(`${antigo.criadoEm.slice(0, 10)}T12:00`).toLocaleDateString('pt-BR')}`
                : 'Sem data de entrada, por ter sido importado'
            ]
          ] as const
        ).map(
          ([nome, l, v]) =>
            l && (
              <Link className="card est-recorde" key={nome} to={`/livro/${l.id}`}>
                <Capa livro={l} />
                <div>
                  <p className="peq muted sem-margem">{nome}</p>
                  <strong>{l.titulo}</strong>
                  <p className="peq sem-margem">{v}</p>
                </div>
              </Link>
            )
        )}
      </div>
    </Secao>
  )
}
