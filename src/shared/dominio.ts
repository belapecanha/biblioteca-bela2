// Fonte única dos valores de domínio. O esquema do banco, os tipos da API e as validações
// derivam daqui; uma opção nova entra só nesta lista (e numa migração, se for coluna com CHECK).
export const STATUS = ['quero_ler', 'lendo', 'lido', 'pausado', 'abandonado'] as const
export type Status = (typeof STATUS)[number]

export const STATUS_LEITURA = ['lendo', 'lido', 'pausado', 'abandonado'] as const
export type StatusLeitura = (typeof STATUS_LEITURA)[number]
/** Leituras que ainda podem continuar; só pode haver uma por livro. */
export const STATUS_EM_ANDAMENTO: readonly StatusLeitura[] = ['lendo', 'pausado']

export const POSSES = ['tenho', 'nao_tenho', 'ja_tive'] as const
export type Posse = (typeof POSSES)[number]

export const TIPOS = ['livro', 'manhwa', 'manga', 'graphic_novel', 'poesia'] as const
export type TipoLivro = (typeof TIPOS)[number]

export const FORMATOS = ['fisico', 'ebook', 'audiolivro'] as const
export type Formato = (typeof FORMATOS)[number]

export const PAPEIS = ['autor', 'tradutor', 'ilustrador'] as const
export type Papel = (typeof PAPEIS)[number]

export const PRECISOES = ['dia', 'ano'] as const
export type Precisao = (typeof PRECISOES)[number]

export const ORIGENS = ['goodreads', 'banco_antigo', 'manual'] as const
export type Origem = (typeof ORIGENS)[number]

export const NOTA_MINIMA = 0.5
export const NOTA_MAXIMA = 5
export const LIMITE_IMAGEM = 15 * 1024 * 1024

export const pertence = <T extends string>(lista: readonly T[], valor: unknown): valor is T =>
  typeof valor === 'string' && (lista as readonly string[]).includes(valor)
