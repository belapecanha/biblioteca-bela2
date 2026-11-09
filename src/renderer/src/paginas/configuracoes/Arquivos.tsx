import { useState } from 'react'
import { useMutation, useQuery } from '@tanstack/react-query'
import { ErroFormulario } from '../../componentes/Formulario'
import { useSalvar } from '../../dados'

// Backup .bela, restauração, exportação CSV e limpeza de imagens sem uso.
export function Arquivos() {
  const [confirmar, setConfirmar] = useState(false)
  const exportar = useMutation({ mutationFn: () => window.bela.arquivos.exportarCsv() })
  const backup = useMutation({ mutationFn: () => window.bela.arquivos.backup() })
  const previa = useMutation({ mutationFn: () => window.bela.arquivos.prepararRestauracao() })
  const restaurar = useSalvar((token: string) => window.bela.arquivos.restaurar(token))
  const ocupado = exportar.isPending || backup.isPending || previa.isPending || restaurar.isPending
  return (
    <section className="card coluna">
      <h2>Exportar e backup</h2>
      <p className="muted peq sem-margem">
        O backup .bela inclui banco, perfil, listas, capas e miniaturas. O arquivo .env permanece no computador e não
        entra no backup.
      </p>
      <div className="linha">
        <button
          type="button"
          className="btn"
          disabled={ocupado}
          onClick={() => {
            backup.reset()
            backup.mutate()
          }}
        >
          {backup.isPending ? 'Criando backup…' : 'Criar backup'}
        </button>
        <button
          type="button"
          className="btn btn2"
          disabled={ocupado}
          onClick={() => {
            setConfirmar(false)
            restaurar.reset()
            previa.mutate()
          }}
        >
          Restaurar backup
        </button>
        <button type="button" className="btn btn2" disabled={ocupado} onClick={() => exportar.mutate()}>
          Exportar CSV
        </button>
      </div>
      <p className="muted peq sem-margem">
        O CSV é uma planilha com os livros e leituras, incluindo notas privadas. Para restaurar a biblioteca inteira,
        use o backup .bela.
      </p>
      {backup.data && (
        <p className="sucesso peq caminho-arquivo" role="status">
          Backup salvo: {backup.data}
        </p>
      )}
      {exportar.data && (
        <p className="sucesso peq caminho-arquivo" role="status">
          CSV salvo: {exportar.data}
        </p>
      )}
      <ErroFormulario erro={backup.error || exportar.error || previa.error || restaurar.error} />
      {previa.data && !restaurar.isSuccess && (
        <div className="aviso coluna" role="alert">
          <h3>Conferir restauração</h3>
          <p className="peq sem-margem">
            {previa.data.nome}: {previa.data.livros} livros, {previa.data.leituras} leituras e {previa.data.imagens}{' '}
            imagens.
          </p>
          <p className="peq sem-margem">
            A biblioteca atual será substituída pelo conteúdo deste backup. Uma cópia completa do estado atual será
            guardada antes.
          </p>
          <label className="check peq">
            <input type="checkbox" checked={confirmar} onChange={(e) => setConfirmar(e.target.checked)} />
            Conferi e quero substituir a biblioteca por este backup
          </label>
          <button
            type="button"
            className="btn"
            disabled={!confirmar || ocupado}
            onClick={() => restaurar.mutate(previa.data!.token)}
          >
            Confirmar restauração
          </button>
          <button type="button" className="btn btn2" disabled={ocupado} onClick={() => previa.reset()}>
            Cancelar restauração
          </button>
        </div>
      )}
      {restaurar.data && (
        <p className="sucesso peq caminho-arquivo" role="status">
          Biblioteca restaurada. Backup anterior: {restaurar.data.backup}
        </p>
      )}
    </section>
  )
}
export function Espaco() {
  const previa = useQuery({
    queryKey: ['imagens-orfas'],
    queryFn: () => window.bela.arquivos.imagensOrfas(),
    staleTime: 0
  })
  const limpar = useMutation({
    mutationFn: () => window.bela.arquivos.limparImagens(),
    onSettled: () => void previa.refetch()
  })
  const mb = (bytes: number) => `${(bytes / 1024 / 1024).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} MB`
  return (
    <section className="card coluna">
      <h2>Imagens sem uso</h2>
      <p className="muted peq sem-margem">
        Capas e fotos que nenhum livro nem o perfil usam mais (por exemplo, capas trocadas antes desta versão). Elas não
        entram no backup.
      </p>
      {previa.data && (
        <p className="peq sem-margem">
          {previa.data.arquivos
            ? `${previa.data.arquivos} arquivos · ${mb(previa.data.bytes)}`
            : 'Nenhuma imagem sem uso.'}
        </p>
      )}
      {previa.isPending && <p className="muted peq sem-margem">Conferindo…</p>}
      <button
        type="button"
        className="btn btn2"
        disabled={!previa.data?.arquivos || limpar.isPending}
        onClick={() => limpar.mutate()}
      >
        {limpar.isPending ? 'Liberando espaço…' : 'Apagar imagens sem uso'}
      </button>
      {limpar.data && (
        <p className="sucesso peq sem-margem" role="status">
          {limpar.data.arquivos} arquivos apagados ({mb(limpar.data.bytes)}).
        </p>
      )}
      <ErroFormulario erro={previa.error || limpar.error} />
    </section>
  )
}
