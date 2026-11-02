import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type { LivroResumo, Posse, Status } from '@shared/api'
import type { TipoClassificacao } from '@shared/classificacoes'

export function useLivros() {
  return useQuery({ queryKey: ['livros'], queryFn: () => window.bela.livros.listar() })
}

export function useLivro(id: number) {
  return useQuery({ queryKey: ['livro', id], queryFn: () => window.bela.livros.obter(id), enabled: Number.isInteger(id) && id > 0 })
}

// A chave começa com 'livros' para ser atualizada junto em toda alteração de livro ou leitura.
export function useAnalise() {
  return useQuery({ queryKey: ['livros', 'analise'], queryFn: () => window.bela.analise.base() })
}

export function useAcoesLivro() {
  const cliente = useQueryClient()
  const opcoes = {
    onSuccess: () => {
      void cliente.invalidateQueries({ queryKey: ['livros'] })
      void cliente.invalidateQueries({ queryKey: ['livro'] })
      void cliente.invalidateQueries({ queryKey: ['diario'] })
    }
  }
  return {
    nota: useMutation({
      mutationFn: ({ id, nota }: { id: number; nota: number | null }) => window.bela.livros.definirNota(id, nota),
      ...opcoes
    }),
    status: useMutation({
      mutationFn: ({ id, status }: { id: number; status: Status }) => window.bela.livros.definirStatus(id, status),
      ...opcoes
    }),
    posse: useMutation({
      mutationFn: ({ ids, posse }: { ids: number[]; posse: Posse | null }) => window.bela.livros.definirPosse(ids, posse),
      ...opcoes
    }),
    classificacoes: useMutation({
      mutationFn: ({ id, tipo, nomes }: { id: number; tipo: TipoClassificacao; nomes: string[] }) =>
        window.bela.livros.definirClassificacoes(id, tipo, nomes),
      ...opcoes
    })
  }
}

export function useSalvar<T, R>(acao: (dados: T) => Promise<R>) {
  const cliente = useQueryClient()
  return useMutation({ mutationFn: acao, onSuccess: () => { void cliente.invalidateQueries({ queryKey: ['livros'] }); void cliente.invalidateQueries({ queryKey: ['livro'] }); void cliente.invalidateQueries({ queryKey: ['diario'] }) } })
}
export function hoje(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}
export function mensagemErro(erro: unknown): string {
  return (erro instanceof Error ? erro.message : 'Não foi possível salvar. Tente novamente.').replace(/^Error invoking remote method '[^']+': (?:Error: )?/, '')
}

export const NOME_STATUS: Record<Status, string> = {
  quero_ler: 'Quero ler',
  lendo: 'Lendo',
  lido: 'Lido',
  pausado: 'Pausado',
  abandonado: 'Abandonado'
}

const PALETA = ['#7E2F3A', '#20323F', '#8A6A22', '#23595C', '#3A2F2B', '#46535E', '#5F3249', '#8A4627', '#26406F']

export function numeroDoTexto(texto: string): number {
  let h = 7
  for (const c of texto) h = (h * 31 + c.charCodeAt(0)) % 9973
  return h
}

export function coresDoLivro(l: Pick<LivroResumo, 'titulo' | 'corPrincipal' | 'corTexto'>): { fundo: string; texto: string } {
  if (l.corPrincipal) return { fundo: l.corPrincipal, texto: l.corTexto ?? '#F6EDE1' }
  return { fundo: PALETA[numeroDoTexto(l.titulo) % PALETA.length], texto: '#F6EDE1' }
}

export function estrelasTexto(nota: number | null): string {
  if (!nota) return ''
  return '★'.repeat(Math.floor(nota)) + (nota % 1 ? '½' : '')
}

export function nomesAutores(l: Pick<LivroResumo, 'autores'>): string {
  return l.autores.map((a) => a.nome).join(', ')
}

export function normalizar(texto: string): string {
  return texto
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
}

export function contar(lista: string[]): [string, number][] {
  const mapa = new Map<string, number>()
  for (const item of lista) mapa.set(item, (mapa.get(item) ?? 0) + 1)
  return [...mapa.entries()].sort((a, b) => b[1] - a[1])
}
