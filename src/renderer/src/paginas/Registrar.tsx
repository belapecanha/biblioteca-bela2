import { useState, type FormEvent } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { useMutation, useQuery } from '@tanstack/react-query'
import type {
  Colaborador,
  DadosLeitura,
  DadosLivro,
  EntradaCapa,
  LivroDetalhe,
  LivroResumo,
  ResultadoGoogle
} from '@shared/api'
import {
  AreaTexto,
  Campo,
  Classificacao,
  ErroFormulario,
  Escolha,
  EscolhaLista,
  EscolhaPais,
  EscolherCapa
} from '../componentes/Formulario'
import { Estado } from '../componentes/Capa'
import { simples } from '@shared/paises'
import { NOME_STATUS, useLivro, useLivros, useSalvar } from '../dados'
import { Estrelas } from '../componentes/Estrelas'

export function dadosDoLivro(l?: LivroDetalhe): DadosLivro {
  return {
    id: l?.id,
    titulo: l?.titulo ?? '',
    tituloOriginal: l?.tituloOriginal ?? null,
    colaboradores: l?.colaboradores.length ? l.colaboradores : [{ nome: '', pais: null, papel: 'autor' }],
    isbn10: l?.isbn10 ?? null,
    isbn13: l?.isbn13 ?? null,
    editora: l?.editora?.nome ?? null,
    paisEditora: l?.paisEditora ?? null,
    serie: l?.serie?.nome ?? null,
    volume: l?.volume ?? null,
    tipo: l?.tipo ?? 'livro',
    formato: l?.formato ?? null,
    paginas: l?.paginas ?? null,
    paginasEstimadas: l?.paginasEstimadas ?? false,
    anoEdicao: l?.anoEdicao ?? null,
    anoPublicacao: l?.anoPublicacao ?? null,
    idioma: l?.idioma ?? null,
    sinopse: l?.sinopse ?? null,
    posse: l?.posse ?? null,
    status: l?.status ?? 'quero_ler',
    generos: l?.generos ?? [],
    temas: l?.temas ?? [],
    moods: l?.moods ?? [],
    notasPrivadas: l?.notasPrivadas ?? null
  }
}
// Mostra as séries de quem já está como autor no cadastro; sem nenhuma conhecida, todas as séries.
export function seriesDaAutoria(
  livros: LivroResumo[],
  colaboradores: Colaborador[]
): { opcoes: string[]; cabecalho: string } {
  const nomes = colaboradores.filter((c) => c.papel === 'autor' && c.nome.trim()).map((c) => c.nome.trim())
  const chaves = new Set(nomes.map(simples))
  const unicas = (ls: LivroResumo[]) =>
    [...new Set(ls.flatMap((l) => (l.serie ? [l.serie.nome] : [])))].sort((a, b) => a.localeCompare(b, 'pt-BR'))
  const daAutoria = unicas(livros.filter((l) => l.autores.some((a) => chaves.has(simples(a.nome)))))
  if (daAutoria.length) return { opcoes: daAutoria, cabecalho: `Séries de ${nomes.join(', ')}` }
  return {
    opcoes: unicas(livros),
    cabecalho: nomes.length ? 'Esta autoria ainda não tem séries. Todas as séries:' : 'Todas as séries'
  }
}

export function Registrar() {
  const id = Number(useParams().id)
  const livro = useLivro(id)
  if (id && !livro.data)
    return livro.data === null ? (
      <main className="wrap pagina">
        <h1>Livro não encontrado</h1>
      </main>
    ) : (
      <Estado carregando={livro.isLoading} erro={livro.isError} aoTentar={() => void livro.refetch()} />
    )
  return <FormularioLivro key={id || 'novo'} livro={livro.data ?? undefined} />
}

function FormularioLivro({ livro }: { livro?: LivroDetalhe }) {
  const navegar = useNavigate()
  const [dados, setDados] = useState<DadosLivro>(() => dadosDoLivro(livro))
  const livros = useLivros()
  // Na chave 'livros', a lista se atualiza depois de salvar uma editora nova.
  const editoras = useQuery({ queryKey: ['livros', 'editoras'], queryFn: () => window.bela.livros.editoras() })
  const [capa, setCapa] = useState<EntradaCapa>()
  const [termo, setTermo] = useState('')
  const [selecionado, setSelecionado] = useState(false)
  const [duplicados, setDuplicados] = useState<LivroResumo[]>([])
  const [confirmar, setConfirmar] = useState(false)
  const [leituraInicial, setLeituraInicial] = useState<Omit<DadosLeitura, 'id' | 'livroId' | 'status' | 'formato'>>({
    dataInicio: null,
    dataFim: null,
    anoFim: null,
    precisaoFim: null,
    nota: null,
    resenha: null
  })
  const busca = useMutation({ mutationFn: (termo: string) => window.bela.google.buscar(termo) })
  const salvar = useSalvar(async (confirmacao: boolean) =>
    window.bela.livros.salvar(
      {
        ...dados,
        leituraInicial:
          !livro && dados.status !== 'quero_ler'
            ? {
                ...leituraInicial,
                status: dados.status,
                formato: dados.formato,
                dataFim: dados.status === 'lido' ? leituraInicial.dataFim : null,
                anoFim: dados.status === 'lido' ? leituraInicial.anoFim : null,
                precisaoFim: dados.status === 'lido' ? leituraInicial.precisaoFim : null
              }
            : undefined
      },
      confirmacao,
      capa
    )
  )
  const mudar = <K extends keyof DadosLivro>(campo: K, valor: DadosLivro[K]) => {
    setDados((d) => ({ ...d, [campo]: valor }))
    setDuplicados([])
    setConfirmar(false)
    salvar.reset()
  }
  const campoTexto = (
    campo: 'titulo' | 'tituloOriginal' | 'isbn10' | 'isbn13' | 'editora' | 'paisEditora' | 'serie' | 'idioma',
    rotulo: string,
    obrigatorio = false
  ) => (
    <Campo
      rotulo={rotulo}
      required={obrigatorio}
      maxLength={campo === 'titulo' || campo === 'tituloOriginal' ? 500 : 300}
      value={dados[campo] ?? ''}
      onChange={(e) => mudar(campo, e.target.value || (campo === 'titulo' ? '' : null))}
    />
  )
  const campoNumero = (campo: 'volume' | 'paginas' | 'anoEdicao' | 'anoPublicacao', rotulo: string) => (
    <Campo
      rotulo={rotulo}
      type="number"
      min={campo === 'volume' ? 0 : 1}
      max={campo.startsWith('ano') ? 9999 : 1000000}
      step={campo === 'volume' ? '0.1' : '1'}
      value={dados[campo] ?? ''}
      onChange={(e) => mudar(campo, e.target.value === '' ? null : Number(e.target.value))}
    />
  )
  const series = seriesDaAutoria(livros.data ?? [], dados.colaboradores)
  const colaborador = (indice: number, atualizacao: Partial<Colaborador>) =>
    mudar(
      'colaboradores',
      dados.colaboradores.map((c, i) => (i === indice ? { ...c, ...atualizacao } : c))
    )
  const importar = (resultado: ResultadoGoogle) => {
    setDados((d) => ({
      ...d,
      titulo: resultado.titulo,
      colaboradores: resultado.autores.map((nome) => ({ nome, pais: null, papel: 'autor' })),
      editora: resultado.editora,
      anoEdicao: resultado.anoEdicao,
      paginas: resultado.paginas,
      idioma: resultado.idioma,
      sinopse: resultado.sinopse,
      isbn10: resultado.isbn10,
      isbn13: resultado.isbn13
    }))
    setCapa(resultado.capaUrl ? { url: resultado.capaUrl } : undefined)
    setSelecionado(true)
    setDuplicados([])
    setConfirmar(false)
  }
  async function enviar(e: FormEvent) {
    e.preventDefault()
    const resultado = await salvar.mutateAsync(confirmar).catch(() => null)
    if (!resultado) return
    if (resultado.duplicados) {
      setDuplicados(resultado.duplicados)
      setConfirmar(false)
      return
    }
    navegar(`/livro/${resultado.id}`)
  }
  return (
    <main className="wrap pagina">
      <div className="cabeca">
        <div>
          <p className="sobretitulo">Sua biblioteca, do seu jeito</p>
          <h1>{livro ? 'Editar livro' : 'Registrar livro'}</h1>
        </div>
        <Link className="btn btn2" to={livro ? `/livro/${livro.id}` : '/estante'}>
          Cancelar
        </Link>
      </div>
      {!livro && (
        <section className="card coluna" aria-labelledby="buscar-google">
          <div>
            <h2 id="buscar-google">Comece por uma busca</h2>
            <p className="muted sem-margem">Encontre uma edição no Google Books ou preencha o cadastro abaixo.</p>
          </div>
          <form
            className="linha busca-cadastro"
            onSubmit={(e) => {
              e.preventDefault()
              setSelecionado(false)
              busca.mutate(termo)
            }}
          >
            <Campo
              rotulo="Título, autor ou ISBN no Google Books"
              required
              value={termo}
              maxLength={300}
              onChange={(e) => setTermo(e.target.value)}
            />
            <button className="btn" disabled={busca.isPending}>
              {busca.isPending ? 'Buscando…' : 'Buscar no Google Books'}
            </button>
            <Link className="link peq" to="/configuracoes">
              Configurar chave
            </Link>
          </form>
          <ErroFormulario erro={busca.error} />
          {busca.isSuccess && !busca.data.length && (
            <p role="status" className="muted">
              Nenhuma edição encontrada. Tente outro termo ou continue pelo cadastro manual.
            </p>
          )}
          {busca.data && !selecionado && (
            <div className="resultados-google">
              {busca.data.map((r) => (
                <button type="button" className="resultado-google" key={r.googleId} onClick={() => importar(r)}>
                  {r.capaUrl ? (
                    <img src={r.capaUrl} alt="" referrerPolicy="no-referrer" />
                  ) : (
                    <span className="capa-mini-vazia">Sem capa</span>
                  )}
                  <span>
                    <strong>{r.titulo}</strong>
                    <span className="muted peq">{r.autores.join(', ') || 'Autor não informado'}</span>
                    <span className="muted peq">
                      {[r.idioma, r.editora, r.anoEdicao, r.isbn13].filter(Boolean).join(' · ')}
                    </span>
                    <span className="link peq">Revisar esta edição →</span>
                  </span>
                </button>
              ))}
            </div>
          )}
          {selecionado && (
            <p role="status" className="aviso sem-margem">
              Edição selecionada. Revise os dados, escolha a classificação e salve quando estiver tudo certo.
            </p>
          )}
        </section>
      )}
      <form className="cadastro" onSubmit={enviar}>
        <aside className="cadastro-capa card">
          <EscolherCapa capa={capa} anterior={livro?.capa} aoMudar={setCapa} />
        </aside>
        <div className="coluna">
          <section className="card coluna">
            <h2>A obra</h2>
            <div className="form-grid">
              {campoTexto('titulo', 'Título', true)}
              {campoTexto('tituloOriginal', 'Título original')}
              <Escolha
                rotulo="Tipo"
                valor={dados.tipo}
                aoMudar={(v) => mudar('tipo', v as DadosLivro['tipo'])}
                opcoes={[
                  ['livro', 'Livro'],
                  ['manhwa', 'Manhwa'],
                  ['manga', 'Mangá'],
                  ['graphic_novel', 'Graphic novel'],
                  ['poesia', 'Poesia']
                ]}
              />
              {campoTexto('idioma', 'Idioma')}
              <EscolhaLista
                rotulo="Série"
                valor={dados.serie}
                aoMudar={(v) => mudar('serie', v)}
                opcoes={series.opcoes}
                cabecalho={series.cabecalho}
                vazio="Nenhuma série encontrada"
                novo="nova série"
              />
              {campoNumero('volume', 'Volume da série')}
              {campoNumero('anoPublicacao', 'Ano da publicação original')}
            </div>
            <div className="sec">
              <h3>Autoria e colaboradores</h3>
              <button
                type="button"
                className="btn btn2 pequeno"
                onClick={() =>
                  mudar('colaboradores', [...dados.colaboradores, { nome: '', pais: null, papel: 'autor' }])
                }
              >
                Adicionar colaborador
              </button>
            </div>
            {dados.colaboradores.map((c, i) => (
              <div className="colaborador" key={i}>
                <Campo
                  rotulo={`Nome do colaborador ${i + 1}`}
                  required
                  maxLength={300}
                  value={c.nome}
                  onChange={(e) => colaborador(i, { nome: e.target.value })}
                />
                <Escolha
                  rotulo={`Papel do colaborador ${i + 1}`}
                  valor={c.papel}
                  aoMudar={(v) => colaborador(i, { papel: v as Colaborador['papel'] })}
                  opcoes={[
                    ['autor', 'Autor'],
                    ['tradutor', 'Tradutor'],
                    ['ilustrador', 'Ilustrador']
                  ]}
                />
                <EscolhaPais
                  rotulo={`País do colaborador ${i + 1}`}
                  valor={c.pais}
                  aoMudar={(pais) => colaborador(i, { pais })}
                />
                <button
                  type="button"
                  className="btn btn2 pequeno"
                  aria-label={`Remover colaborador ${i + 1}`}
                  disabled={dados.colaboradores.length <= 1}
                  onClick={() =>
                    mudar(
                      'colaboradores',
                      dados.colaboradores.filter((_, n) => n !== i)
                    )
                  }
                >
                  Remover
                </button>
              </div>
            ))}
            <AreaTexto rotulo="Sinopse" valor={dados.sinopse ?? ''} aoMudar={(v) => mudar('sinopse', v || null)} />
          </section>
          <section className="card coluna">
            <h2>A edição</h2>
            <div className="form-grid">
              <EscolhaLista
                rotulo="Editora"
                valor={dados.editora}
                opcoes={(editoras.data ?? []).map((e) => e.nome)}
                vazio="Nenhuma editora encontrada"
                novo="nova editora"
                aoMudar={(nome) => {
                  // Uma editora já registrada traz o país dela, sem apagar um país preenchido à mão.
                  const pais = editoras.data?.find((e) => e.nome === nome)?.pais
                  setDados((d) => ({ ...d, editora: nome, paisEditora: d.paisEditora ?? pais ?? null }))
                  setDuplicados([])
                  setConfirmar(false)
                  salvar.reset()
                }}
              />
              {campoTexto('paisEditora', 'País da editora')}
              {campoNumero('anoEdicao', 'Ano da edição')}
              {campoTexto('isbn10', 'ISBN-10')}
              {campoTexto('isbn13', 'ISBN-13')}
              {campoNumero('paginas', 'Número de páginas')}
              <Escolha
                rotulo="Formato"
                valor={dados.formato ?? ''}
                aoMudar={(v) => mudar('formato', (v || null) as DadosLivro['formato'])}
                opcoes={[
                  ['', 'Não informado'],
                  ['fisico', 'Físico'],
                  ['ebook', 'E-book'],
                  ['audiolivro', 'Audiolivro']
                ]}
              />
            </div>
            <label className="check">
              <input
                type="checkbox"
                checked={dados.paginasEstimadas}
                onChange={(e) => mudar('paginasEstimadas', e.target.checked)}
              />
              O número de páginas é estimado
            </label>
          </section>
          <section className="card coluna">
            <h2>Na sua biblioteca</h2>
            <div className="form-grid">
              <Escolha
                rotulo="Status do livro"
                valor={dados.status}
                aoMudar={(v) => mudar('status', v as DadosLivro['status'])}
                opcoes={Object.entries(NOME_STATUS)}
              />
              <Escolha
                rotulo="Posse do livro"
                valor={dados.posse ?? ''}
                aoMudar={(v) => mudar('posse', (v || null) as DadosLivro['posse'])}
                opcoes={[
                  ['', 'A definir'],
                  ['tenho', 'Tenho'],
                  ['nao_tenho', 'Não tenho'],
                  ['ja_tive', 'Já tive']
                ]}
              />
            </div>
            {!livro && dados.status !== 'quero_ler' && (
              <div className="coluna primeira-leitura">
                <h3>Primeira leitura</h3>
                <div className="form-grid">
                  <Campo
                    rotulo="Data de início da primeira leitura"
                    type="date"
                    value={leituraInicial.dataInicio ?? ''}
                    onChange={(e) => {
                      setLeituraInicial((l) => ({ ...l, dataInicio: e.target.value || null }))
                      salvar.reset()
                    }}
                  />
                  {dados.status === 'lido' && (
                    <>
                      <Escolha
                        rotulo="Precisão da primeira conclusão"
                        valor={leituraInicial.precisaoFim ?? ''}
                        opcoes={[
                          ['', 'Sem data'],
                          ['dia', 'Dia exato'],
                          ['ano', 'Somente o ano']
                        ]}
                        aoMudar={(v) =>
                          setLeituraInicial((l) => ({
                            ...l,
                            precisaoFim: (v || null) as DadosLeitura['precisaoFim'],
                            dataFim: null,
                            anoFim: null
                          }))
                        }
                      />
                      {leituraInicial.precisaoFim === 'dia' && (
                        <Campo
                          rotulo="Data da primeira conclusão"
                          type="date"
                          required
                          value={leituraInicial.dataFim ?? ''}
                          onChange={(e) =>
                            setLeituraInicial((l) => ({
                              ...l,
                              dataFim: e.target.value || null,
                              anoFim: e.target.value ? Number(e.target.value.slice(0, 4)) : null
                            }))
                          }
                        />
                      )}
                      {leituraInicial.precisaoFim === 'ano' && (
                        <Campo
                          rotulo="Ano da primeira conclusão"
                          type="number"
                          min="1"
                          max="9999"
                          required
                          value={leituraInicial.anoFim ?? ''}
                          onChange={(e) =>
                            setLeituraInicial((l) => ({ ...l, anoFim: e.target.value ? Number(e.target.value) : null }))
                          }
                        />
                      )}
                    </>
                  )}
                </div>
                <div>
                  <span className="rot">Nota da primeira leitura</span>
                  <Estrelas nota={leituraInicial.nota} aoMudar={(v) => setLeituraInicial((l) => ({ ...l, nota: v }))} />
                </div>
                <AreaTexto
                  rotulo="Resenha da primeira leitura"
                  valor={leituraInicial.resenha ?? ''}
                  aoMudar={(v) => setLeituraInicial((l) => ({ ...l, resenha: v || null }))}
                />
              </div>
            )}
            <Classificacao generos={dados.generos} temas={dados.temas} moods={dados.moods} aoMudar={mudar} />
            <AreaTexto
              rotulo="Notas privadas"
              valor={dados.notasPrivadas ?? ''}
              aoMudar={(v) => mudar('notasPrivadas', v || null)}
            />
          </section>
          {duplicados.length > 0 && (
            <div className="card coluna aviso" role="alert">
              <h3>Este livro pode já estar na biblioteca</h3>
              <p className="sem-margem">Confira os registros encontrados antes de criar outra edição.</p>
              {duplicados.map((l) => (
                <Link className="link" key={l.id} to={`/livro/${l.id}`}>
                  {l.titulo} — {l.autores.map((a) => a.nome).join(', ')}
                </Link>
              ))}
              <label className="check">
                <input type="checkbox" checked={confirmar} onChange={(e) => setConfirmar(e.target.checked)} />
                Conferi e quero salvar esta edição mesmo assim
              </label>
            </div>
          )}
          <ErroFormulario erro={salvar.error} />
          <div className="acoes-form">
            <Link className="btn btn2" to={livro ? `/livro/${livro.id}` : '/estante'}>
              Cancelar
            </Link>
            <button className="btn" disabled={salvar.isPending || (!!duplicados.length && !confirmar)}>
              {salvar.isPending ? 'Salvando…' : livro ? 'Salvar alterações' : 'Salvar livro'}
            </button>
          </div>
        </div>
      </form>
    </main>
  )
}
