import { useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import type { PerfilDados, PerfilEdicao } from '@shared/api'
import { LIMITE_IMAGEM } from '@shared/dominio'
import { AreaTexto, Campo, ErroFormulario, usePreviaArquivo } from '../../componentes/Formulario'
import { mensagemErro, useSalvar } from '../../dados'

// Nome, frase, foto e imagem do topo do perfil.
function ImagemPerfil({
  rotulo,
  anterior,
  valor,
  aoMudar
}: {
  rotulo: string
  anterior: string | null
  valor: Uint8Array | null | undefined
  aoMudar: (valor: Uint8Array | null) => void
}) {
  const [previaLocal, definirPrevia] = usePreviaArquivo()
  const [erro, setErro] = useState('')
  // undefined: mantém a imagem salva; null: remove; bytes: a imagem escolhida agora.
  const preview = valor === undefined ? anterior : valor === null ? null : previaLocal
  return (
    <div className="coluna perfil-imagem-campo">
      <label className="rot">
        {rotulo}
        <input
          className="campo campo-arquivo larga"
          aria-label={rotulo}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          onChange={async (e) => {
            const arquivo = e.target.files?.[0]
            e.target.value = ''
            if (!arquivo) return
            try {
              setErro('')
              if (arquivo.size > LIMITE_IMAGEM) throw new Error('Escolha uma imagem de até 15 MB.')
              aoMudar(new Uint8Array(await arquivo.arrayBuffer()))
              definirPrevia(arquivo)
            } catch (erro) {
              setErro(mensagemErro(erro))
            }
          }}
        />
      </label>
      {preview && (
        <div className="perfil-previa">
          <img src={preview} alt={`Prévia: ${rotulo}`} />
          <button className="btn btn2 pequeno" type="button" onClick={() => aoMudar(null)}>
            Remover {rotulo.toLowerCase()}
          </button>
        </div>
      )}
      <ErroFormulario erro={erro} />
    </div>
  )
}
export function FormPerfil({ perfil }: { perfil: PerfilDados }) {
  const [nome, setNome] = useState(perfil.nome)
  const [frase, setFrase] = useState(perfil.frase)
  const [foto, setFoto] = useState<Uint8Array | null>()
  const [topo, setTopo] = useState<Uint8Array | null>()
  const salvar = useSalvar((dados: PerfilEdicao) => window.bela.perfil.salvar(dados))
  // Quando o perfil salvo muda (depois de salvar ou restaurar), o formulário volta a refletir o banco.
  // Ajuste durante a renderização, como recomenda o React, em vez de um efeito.
  const versao = `${perfil.nome}|${perfil.frase}|${perfil.foto}|${perfil.topo}`
  const [versaoVista, setVersaoVista] = useState(versao)
  if (versao !== versaoVista) {
    setVersaoVista(versao)
    setNome(perfil.nome)
    setFrase(perfil.frase)
    setFoto(undefined)
    setTopo(undefined)
  }
  function enviar(e: FormEvent) {
    e.preventDefault()
    salvar.mutate(
      { nome, frase, foto, topo },
      {
        onSuccess: () => {
          setFoto(undefined)
          setTopo(undefined)
        }
      }
    )
  }
  return (
    <form className="card coluna" onSubmit={enviar}>
      <h2>Perfil</h2>
      <Campo
        rotulo="Nome do perfil"
        maxLength={100}
        required
        value={nome}
        onChange={(e) => {
          setNome(e.target.value)
          salvar.reset()
        }}
      />
      <AreaTexto
        rotulo="Frase de perfil"
        valor={frase}
        linhas={2}
        aoMudar={(v) => {
          setFrase(v)
          salvar.reset()
        }}
      />
      <ImagemPerfil rotulo="Foto do perfil" anterior={perfil.foto} valor={foto} aoMudar={setFoto} />
      <ImagemPerfil rotulo="Imagem do topo" anterior={perfil.topo} valor={topo} aoMudar={setTopo} />
      <p className="muted peq sem-margem">
        JPG, PNG ou WebP, até 15 MB. Sem imagem do topo, o perfil mostra um mosaico das suas capas.
      </p>
      <button className="btn" disabled={salvar.isPending}>
        {salvar.isPending ? 'Salvando…' : 'Salvar perfil'}
      </button>
      <ErroFormulario erro={salvar.error} />
      {salvar.isSuccess && (
        <p className="sucesso peq sem-margem" role="status">
          Perfil salvo.
        </p>
      )}
      <Link className="link peq" to="/perfil">
        Ver meu perfil
      </Link>
    </form>
  )
}
