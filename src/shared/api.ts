export interface EstadoApp {
  versao: string
  livros: number
  classificacoes: number
  pastaDados: string
}

export interface ApiBela {
  estado: () => Promise<EstadoApp>
}
