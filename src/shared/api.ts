import type { TipoClassificacao } from './classificacoes'

export const STATUS = ['quero_ler', 'lendo', 'lido', 'pausado', 'abandonado'] as const
export type Status = (typeof STATUS)[number]

export const POSSES = ['tenho', 'nao_tenho', 'ja_tive'] as const
export type Posse = (typeof POSSES)[number]

export type TipoLivro = 'livro' | 'manhwa' | 'manga' | 'graphic_novel' | 'poesia'
export type Formato = 'fisico' | 'ebook' | 'audiolivro'

export interface EstadoApp {
  versao: string
  livros: number
  classificacoes: number
  pastaDados: string
}

export interface Referencia {
  id: number
  nome: string
}

export interface Autor extends Referencia { pais?: string | null }

export interface LivroResumo {
  id: number
  titulo: string
  tituloOriginal: string | null
  autores: Autor[]
  editora: Referencia | null
  paisEditora: string | null
  serie: Referencia | null
  volume: number | null
  tipo: TipoLivro
  formato: Formato | null
  paginas: number | null
  paginasEstimadas: boolean
  status: Status
  posse: Posse | null
  favorito: boolean
  nota: number | null
  anoLido: number | null
  dataLida: string | null
  capa: string | null
  miniatura: string | null
  corPrincipal: string | null
  /** Até duas cores vivas da capa, usadas nos detalhes da lombada. */
  coresDestaque: string[]
  corTexto: string | null
  generos: string[]
  temas: string[]
  moods: string[]
}

export interface Leitura {
  id: number
  status: Exclude<Status, 'quero_ler'>
  formato: Formato | null
  dataInicio: string | null
  dataFim: string | null
  anoFim: number | null
  precisaoFim: 'dia' | 'ano' | null
  nota: number | null
  resenha: string | null
}

export interface LivroDetalhe extends LivroResumo {
  sinopse: string | null
  anoPublicacao: number | null
  anoEdicao: number | null
  isbn13: string | null
  isbn10: string | null
  idioma: string | null
  notasPrivadas: string | null
  colaboradores: Colaborador[]
  leituras: Leitura[]
  progresso: Progresso[]
  citacoes: Citacao[]
}

export interface Colaborador { nome: string; pais: string | null; papel: 'autor' | 'tradutor' | 'ilustrador' }
export interface Progresso { id: number; leituraId: number; data: string; pagina: number }
export interface Citacao { id: number; texto: string; pagina: number | null }
export interface DadosLivro {
  id?: number
  titulo: string
  tituloOriginal: string | null
  colaboradores: Colaborador[]
  isbn10: string | null
  isbn13: string | null
  editora: string | null
  paisEditora: string | null
  serie: string | null
  volume: number | null
  tipo: TipoLivro
  formato: Formato | null
  paginas: number | null
  paginasEstimadas: boolean
  anoEdicao: number | null
  anoPublicacao: number | null
  idioma: string | null
  sinopse: string | null
  posse: Posse | null
  status: Status
  generos: string[]
  temas: string[]
  moods: string[]
  notasPrivadas: string | null
  leituraInicial?: Omit<DadosLeitura, 'id' | 'livroId'>
}
export type EntradaCapa = { bytes: number[] } | { url: string }
export type ResultadoSalvarLivro = { id: number; duplicados?: never } | { duplicados: LivroResumo[]; id?: never }
export interface DadosLeitura {
  id?: number
  livroId: number
  status: Leitura['status']
  formato: Formato | null
  dataInicio: string | null
  dataFim: string | null
  anoFim: number | null
  precisaoFim: 'dia' | 'ano' | null
  nota: number | null
  resenha: string | null
}
export interface LeituraDiario extends Leitura { livro: LivroResumo; progresso: Progresso[] }
export interface ResultadoGoogle {
  googleId: string
  titulo: string
  autores: string[]
  editora: string | null
  anoEdicao: number | null
  paginas: number | null
  idioma: string | null
  sinopse: string | null
  isbn10: string | null
  isbn13: string | null
  capaUrl: string | null
  fonte: 'google' | 'openlibrary'
}
export interface ConfiguracaoGoogle { configurada: boolean; arquivo: string }
export interface LeituraAnalise {
  id: number
  formato: Formato | null
  ano: number | null
  data: string | null
  precisao: 'dia' | 'ano' | null
  nota: number | null
  temResenha: boolean
}
export interface LivroAnalise extends LivroResumo {
  anoPublicacao: number | null
  pais: string | null
  cor1: string | null
  cor2: string | null
  origem: 'goodreads' | 'banco_antigo' | 'manual'
  criadoEm: string
  primeiroInicio: string | null
  leituras: LeituraAnalise[]
}
export interface BaseAnalise { livros: LivroAnalise[]; metas: Record<number, number> }
export interface PerfilDados { nome: string; frase: string; foto: string | null; topo: string | null }
export interface PerfilEdicao { nome: string; frase: string; foto?: number[] | null; topo?: number[] | null }
export interface ListaDados { id?: number; nome: string; descricao: string | null; ordenada: boolean }
export interface ListaResumo extends Required<ListaDados> { total: number; capas: LivroResumo[] }
export interface ListaDetalhe extends ListaResumo { livros: LivroResumo[] }
export interface PainelPerfil {
  perfil: PerfilDados
  favoritos: LivroResumo[]
  lendo: { livro: LivroResumo; leituraId: number; pagina: number | null }[]
  fila: LivroResumo[]
  numeros: { lidos: number; noAno: number; paginas: number; series: number; listas: number }
  meta: number | null
  atividade: { livro: LivroResumo; data: string | null; ano: number | null; nota: number | null }[]
  series: { id: number; nome: string; lidos: number; cadastrados: number; total: number | null }[]
}
export interface PendenciaDados { codigo: string; rotulo: string; livros: LivroResumo[] }
export interface PreviaImportacao { token: string; total: number; novos: number; repetidos: number; invalidos: number; titulos: string[]; avisos: string[] }
export interface PreviaRestauracao { token: string; livros: number; leituras: number; imagens: number; nome: string }
export interface ResultadoImportacao { adicionados: number; ignorados: number; backup: string }

export interface ApiBela {
  estado: () => Promise<EstadoApp>
  livros: {
    listar: () => Promise<LivroResumo[]>
    obter: (id: number) => Promise<LivroDetalhe | null>
    definirNota: (id: number, nota: number | null) => Promise<void>
    definirStatus: (id: number, status: Status) => Promise<void>
    definirPosse: (ids: number[], posse: Posse | null) => Promise<void>
    definirClassificacoes: (id: number, tipo: TipoClassificacao, nomes: string[]) => Promise<void>
    salvar: (dados: DadosLivro, confirmarDuplicado?: boolean, capa?: EntradaCapa) => Promise<ResultadoSalvarLivro>
    duplicados: (dados: DadosLivro) => Promise<LivroResumo[]>
    trocarCapa: (id: number, capa: EntradaCapa) => Promise<void>
    salvarNotas: (id: number, texto: string | null) => Promise<void>
    editoras: () => Promise<{ nome: string; pais: string | null }[]>
  }
  leituras: {
    salvar: (dados: DadosLeitura) => Promise<number>
    progresso: (livroId: number, leituraId: number, data: string, pagina: number) => Promise<void>
    removerProgresso: (livroId: number, id: number) => Promise<void>
    salvarCitacao: (livroId: number, citacao: Omit<Citacao, 'id'> & { id?: number }) => Promise<void>
    removerCitacao: (livroId: number, id: number) => Promise<void>
    diario: () => Promise<LeituraDiario[]>
  }
  google: {
    configuracao: () => Promise<ConfiguracaoGoogle>
    buscar: (termo: string) => Promise<ResultadoGoogle[]>
  }
  analise: {
    base: () => Promise<BaseAnalise>
    definirMeta: (ano: number, livros: number | null) => Promise<void>
    salvarImagem: (ano: number) => Promise<string | null>
  }
  perfil: {
    dados: () => Promise<PerfilDados>
    painel: (ano: number) => Promise<PainelPerfil>
    salvar: (dados: PerfilEdicao) => Promise<void>
    favoritos: (ids: number[]) => Promise<void>
    fila: (ids: number[]) => Promise<void>
    pendencias: () => Promise<PendenciaDados[]>
  }
  listas: {
    listar: () => Promise<ListaResumo[]>
    obter: (id: number) => Promise<ListaDetalhe | null>
    salvar: (dados: ListaDados) => Promise<number>
    adicionar: (id: number, livros: number[]) => Promise<void>
    removerLivro: (id: number, livroId: number) => Promise<void>
    ordenar: (id: number, livros: number[]) => Promise<void>
    excluir: (id: number) => Promise<void>
  }
  arquivos: {
    prepararCsv: (csv: string) => Promise<PreviaImportacao>
    importarCsv: (token: string) => Promise<ResultadoImportacao>
    exportarCsv: () => Promise<string | null>
    backup: () => Promise<string | null>
    prepararRestauracao: () => Promise<PreviaRestauracao | null>
    restaurar: (token: string) => Promise<{ backup: string }>
  }
}
