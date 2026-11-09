import { LIMITE_IMAGEM } from '@shared/dominio'
import { useEffect, useId, useState, type InputHTMLAttributes, type KeyboardEvent, type ReactNode } from 'react'
import type { EntradaCapa } from '@shared/api'
import { GENEROS, MOODS, TEMAS } from '@shared/classificacoes'
import { exatoEm, filtrarPorTexto, PAISES } from '@shared/paises'
import { mensagemErro } from '../dados'
import { CapaDesenhada } from './Capa'

export function Campo({
  rotulo,
  children,
  ...props
}: InputHTMLAttributes<HTMLInputElement> & { rotulo: string; children?: ReactNode }) {
  const id = useId()
  return (
    <div className="form-campo">
      <label className="rot" htmlFor={id}>
        {rotulo}
      </label>
      {children ?? <input {...props} id={id} className={`campo larga ${props.className ?? ''}`} />}
    </div>
  )
}
export function EscolhaPais({
  rotulo,
  valor,
  aoMudar
}: {
  rotulo: string
  valor: string | null
  aoMudar: (pais: string | null) => void
}) {
  return <EscolhaLista rotulo={rotulo} valor={valor} aoMudar={aoMudar} opcoes={PAISES} vazio="Nenhum país encontrado" />
}

// Lista que diminui conforme a digitação. Texto fora da lista volta ao valor anterior ao sair,
// a menos que a pessoa escolha a opção de adicionar um item novo.
export function EscolhaLista({
  rotulo,
  valor,
  aoMudar,
  opcoes: todas,
  vazio,
  cabecalho,
  novo
}: {
  rotulo: string
  valor: string | null
  aoMudar: (v: string | null) => void
  opcoes: string[]
  vazio: string
  cabecalho?: string
  novo?: string
}) {
  const id = useId()
  const [digitado, setDigitado] = useState<string | null>(null)
  const [aberta, setAberta] = useState(false)
  const [ativo, setAtivo] = useState(0)
  const texto = digitado?.trim() ?? ''
  const filtradas = filtrarPorTexto(todas, texto)
  const adicionar = novo && texto && !exatoEm(todas, texto) ? texto : null
  const opcoes = adicionar ? [...filtradas, adicionar] : filtradas
  useEffect(() => {
    if (aberta) document.getElementById(`${id}-${ativo}`)?.scrollIntoView({ block: 'nearest' })
  }, [aberta, ativo, id])
  const escolher = (v: string) => {
    aoMudar(v)
    setDigitado(null)
    setAberta(false)
  }
  function sair() {
    if (digitado !== null) {
      const existente = exatoEm(todas, digitado)
      if (existente) aoMudar(existente)
      else if (!texto) aoMudar(null)
    }
    setDigitado(null)
    setAberta(false)
  }
  function tecla(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault()
      if (!aberta) setAberta(true)
      else if (opcoes.length) setAtivo((a) => (a + (e.key === 'ArrowDown' ? 1 : -1) + opcoes.length) % opcoes.length)
    } else if (e.key === 'Enter' && aberta) {
      e.preventDefault()
      if (opcoes[ativo]) escolher(opcoes[ativo])
    } else if (e.key === 'Escape' && aberta) {
      e.preventDefault()
      setDigitado(null)
      setAberta(false)
    }
  }
  return (
    <div className="form-campo escolha-lista">
      <label className="rot" htmlFor={id}>
        {rotulo}
      </label>
      <input
        id={id}
        className="campo larga"
        role="combobox"
        aria-expanded={aberta}
        aria-controls={`${id}-lista`}
        aria-autocomplete="list"
        aria-activedescendant={aberta && opcoes[ativo] ? `${id}-${ativo}` : undefined}
        autoComplete="off"
        placeholder="Selecionar"
        value={digitado ?? valor ?? ''}
        onChange={(e) => {
          setDigitado(e.target.value)
          setAberta(true)
          setAtivo(0)
        }}
        onClick={() => setAberta(true)}
        onFocus={(e) => {
          e.target.select()
          setAberta(true)
          setAtivo(0)
        }}
        onBlur={sair}
        onKeyDown={tecla}
      />
      {aberta && (
        <ul id={`${id}-lista`} role="listbox" aria-label={rotulo}>
          {cabecalho && (
            <li role="presentation" className="muted cabecalho">
              {cabecalho}
            </li>
          )}
          {opcoes.map((p, i) => (
            <li
              key={i === filtradas.length ? `+${p}` : p}
              id={`${id}-${i}`}
              role="option"
              aria-selected={i === ativo}
              className={`${i === ativo ? 'on' : ''} ${i === filtradas.length ? 'novo' : ''}`}
              onMouseEnter={() => setAtivo(i)}
              onMouseDown={(e) => {
                e.preventDefault()
                escolher(p)
              }}
            >
              {i === filtradas.length ? `+ Adicionar ${novo} “${p}”` : p}
            </li>
          ))}
          {!opcoes.length && (
            <li className="muted vazio">{novo ? `${vazio}. Digite um nome para adicionar.` : vazio}</li>
          )}
        </ul>
      )}
    </div>
  )
}
export function AreaTexto({
  rotulo,
  valor,
  aoMudar,
  linhas = 4
}: {
  rotulo: string
  valor: string
  aoMudar: (s: string) => void
  linhas?: number
}) {
  const id = useId()
  return (
    <div className="form-campo">
      <label className="rot" htmlFor={id}>
        {rotulo}
      </label>
      <textarea id={id} className="campo larga" rows={linhas} value={valor} onChange={(e) => aoMudar(e.target.value)} />
    </div>
  )
}
export function Escolha({
  rotulo,
  valor,
  aoMudar,
  opcoes,
  obrigatorio = false
}: {
  rotulo: string
  valor: string
  aoMudar: (s: string) => void
  opcoes: [string, string][]
  obrigatorio?: boolean
}) {
  const id = useId()
  return (
    <div className="form-campo">
      <label className="rot" htmlFor={id}>
        {rotulo}
      </label>
      <select
        id={id}
        className="campo larga"
        value={valor}
        required={obrigatorio}
        onChange={(e) => aoMudar(e.target.value)}
      >
        {opcoes.map(([v, n]) => (
          <option key={v} value={v}>
            {n}
          </option>
        ))}
      </select>
    </div>
  )
}
export function Classificacao({
  generos,
  temas,
  moods,
  aoMudar
}: {
  generos: string[]
  temas: string[]
  moods: string[]
  aoMudar: (campo: 'generos' | 'temas' | 'moods', valor: string[]) => void
}) {
  return (
    <div className="coluna">
      {(
        [
          ['generos', 'Gêneros', GENEROS, generos],
          ['temas', 'Temas', TEMAS, temas],
          ['moods', 'Moods', MOODS, moods]
        ] as const
      ).map(([campo, nome, opcoes, atuais]) => (
        <details key={campo} className="classificacao-form" open={atuais.length > 0 || undefined}>
          <summary>
            {nome}
            <span className="muted peq">{atuais.length ? atuais.join(' · ') : 'Selecionar'}</span>
          </summary>
          <div className="linha">
            {opcoes.map((n) => (
              <button
                key={n}
                type="button"
                aria-pressed={atuais.includes(n)}
                className={`btn btn2 pequeno ${atuais.includes(n) ? 'on' : ''}`}
                onClick={() => aoMudar(campo, atuais.includes(n) ? atuais.filter((v) => v !== n) : [...atuais, n])}
              >
                {n}
              </button>
            ))}
          </div>
        </details>
      ))}
    </div>
  )
}
/**
 * Endereço temporário (blob:) para mostrar a imagem escolhida antes de salvar. É criado no evento
 * de escolha e liberado quando outra imagem é escolhida ou o componente sai da tela.
 */
export function usePreviaArquivo(): [string | null, (arquivo: Blob) => void] {
  const [url, setUrl] = useState<string | null>(null)
  useEffect(
    () => () => {
      if (url) URL.revokeObjectURL(url)
    },
    [url]
  )
  return [url, (arquivo) => setUrl(URL.createObjectURL(arquivo))]
}

export function EscolherCapa({
  capa,
  anterior,
  aoMudar
}: {
  capa?: EntradaCapa
  anterior?: string | null
  aoMudar: (capa?: EntradaCapa) => void
}) {
  const [previaLocal, definirPrevia] = usePreviaArquivo()
  const [erro, setErro] = useState('')
  const preview = capa ? ('bytes' in capa ? previaLocal : capa.url) : (anterior ?? null)
  return (
    <div className="capa-escolha coluna">
      {preview ? (
        <img className="capa" src={preview} alt="Prévia da capa" referrerPolicy="no-referrer" />
      ) : (
        <CapaDesenhada className="capa" titulo="Sua próxima leitura" cor="#3c4c57" />
      )}
      <label className="rot">
        Escolher capa
        <input
          aria-label="Escolher capa"
          className="campo campo-arquivo larga"
          type="file"
          accept="image/jpeg,image/png,image/webp"
          onChange={async (e) => {
            const arquivo = e.target.files?.[0]
            e.target.value = ''
            if (!arquivo) return
            setErro('')
            try {
              if (arquivo.size > LIMITE_IMAGEM) throw new Error('Escolha uma imagem de até 15 MB.')
              aoMudar({ bytes: new Uint8Array(await arquivo.arrayBuffer()) })
              definirPrevia(arquivo)
            } catch (erro) {
              setErro(mensagemErro(erro))
            }
          }}
        />
      </label>
      <span className="muted peq">JPG, PNG ou WebP, até 15 MB.</span>
      {capa && (
        <button type="button" className="btn btn2 pequeno" onClick={() => aoMudar()}>
          Descartar nova capa
        </button>
      )}
      {erro && (
        <p role="alert" className="erro peq">
          {erro}
        </p>
      )}
    </div>
  )
}
export function ErroFormulario({ erro }: { erro: unknown }) {
  return erro ? (
    <p role="alert" className="erro aviso">
      {mensagemErro(erro)}
    </p>
  ) : null
}
