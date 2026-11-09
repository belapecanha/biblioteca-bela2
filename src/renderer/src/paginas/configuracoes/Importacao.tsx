import { useState } from 'react'
import { useMutation } from '@tanstack/react-query'
import { ErroFormulario } from '../../componentes/Formulario'
import { mensagemErro, useSalvar } from '../../dados'

// Importação do CSV do Goodreads, com prévia antes de gravar.
export function Importacao() {
  const [erroArquivo, setErroArquivo] = useState('')
  const previa = useMutation({ mutationFn: (csv: string) => window.bela.arquivos.prepararCsv(csv) })
  const importar = useSalvar((token: string) => window.bela.arquivos.importarCsv(token))
  return (
    <section className="card coluna">
      <h2>Importar do Goodreads</h2>
      <p className="muted peq sem-margem">
        Escolha o CSV exportado pelo Goodreads. Revise antes de importar; livros já existentes são preservados e
        ignorados.
      </p>
      <label className="rot">
        Arquivo CSV
        <input
          className="campo campo-arquivo larga"
          aria-label="Arquivo CSV do Goodreads"
          type="file"
          accept=".csv,text/csv"
          disabled={previa.isPending || importar.isPending}
          onChange={async (e) => {
            const arquivo = e.target.files?.[0]
            e.target.value = ''
            if (!arquivo) return
            previa.reset()
            importar.reset()
            setErroArquivo('')
            try {
              if (arquivo.size > 10 * 1024 * 1024) throw new Error('Escolha um CSV de até 10 MB.')
              await previa.mutateAsync(await arquivo.text())
            } catch (erro) {
              setErroArquivo(mensagemErro(erro))
            }
          }}
        />
      </label>
      {previa.isPending && (
        <p role="status" className="muted peq">
          Conferindo o arquivo…
        </p>
      )}
      <ErroFormulario erro={erroArquivo || previa.error || importar.error} />
      {previa.data && !importar.isSuccess && (
        <div className="coluna importacao-previa">
          <h3>Prévia da importação</h3>
          <p className="peq sem-margem">
            {previa.data.total} registros · {previa.data.novos} novos · {previa.data.repetidos} repetidos ·{' '}
            {previa.data.invalidos} inválidos
          </p>
          {!!previa.data.titulos.length && (
            <ul>
              {previa.data.titulos.map((t, i) => (
                <li key={i}>{t}</li>
              ))}
            </ul>
          )}
          {previa.data.novos > 15 && <p className="muted peq sem-margem">E mais {previa.data.novos - 15} títulos.</p>}
          {!!previa.data.avisos.length && (
            <details>
              <summary>Ver linhas que precisam de correção</summary>
              <ul>
                {previa.data.avisos.map((a) => (
                  <li key={a}>{a}</li>
                ))}
              </ul>
            </details>
          )}
          <p className="muted peq sem-margem">
            Um backup completo será criado antes de adicionar os livros novos. Notas e resenhas são preservadas.
          </p>
          <button
            className="btn"
            type="button"
            disabled={!previa.data.novos || importar.isPending}
            onClick={() => importar.mutate(previa.data!.token)}
          >
            {importar.isPending ? 'Importando…' : `Importar ${previa.data.novos} livros novos`}
          </button>
        </div>
      )}
      {importar.data && (
        <div className="sucesso peq" role="status">
          <p>
            {importar.data.adicionados} livros adicionados; {importar.data.ignorados} registros ignorados.
          </p>
          <p className="caminho-arquivo">Backup anterior: {importar.data.backup}</p>
        </div>
      )}
    </section>
  )
}
