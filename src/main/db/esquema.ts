import { sql } from 'drizzle-orm'
import {
  check,
  index,
  integer,
  primaryKey,
  real,
  sqliteTable,
  text,
  uniqueIndex
} from 'drizzle-orm/sqlite-core'

const agora = sql`CURRENT_TIMESTAMP`

export const editoras = sqliteTable('editoras', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  nome: text('nome').notNull().unique(),
  pais: text('pais')
})

export const autores = sqliteTable('autores', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  nome: text('nome').notNull().unique(),
  pais: text('pais')
})

export const series = sqliteTable('series', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  nome: text('nome').notNull().unique(),
  totalVolumes: integer('total_volumes')
})

export const livros = sqliteTable(
  'livros',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    goodreadsId: text('goodreads_id').unique(),
    titulo: text('titulo').notNull(),
    tituloOriginal: text('titulo_original'),
    isbn10: text('isbn10'),
    isbn13: text('isbn13'),
    editoraId: integer('editora_id').references(() => editoras.id, { onDelete: 'set null' }),
    serieId: integer('serie_id').references(() => series.id, { onDelete: 'set null' }),
    volume: real('volume'),
    tipo: text('tipo', { enum: ['livro', 'manhwa', 'manga', 'graphic_novel', 'poesia'] })
      .notNull()
      .default('livro'),
    formato: text('formato', { enum: ['fisico', 'ebook', 'audiolivro'] }),
    paginas: integer('paginas'),
    paginasEstimadas: integer('paginas_estimadas', { mode: 'boolean' }).notNull().default(false),
    anoEdicao: integer('ano_edicao'),
    anoPublicacao: integer('ano_publicacao'),
    idioma: text('idioma'),
    sinopse: text('sinopse'),
    capaArquivo: text('capa_arquivo'),
    miniaturaArquivo: text('miniatura_arquivo'),
    corPrincipal: text('cor_principal'),
    corDestaque1: text('cor_destaque_1'),
    corDestaque2: text('cor_destaque_2'),
    corTexto: text('cor_texto'),
    status: text('status', { enum: ['quero_ler', 'lendo', 'lido', 'pausado', 'abandonado'] })
      .notNull()
      .default('quero_ler'),
    posse: text('posse', { enum: ['tenho', 'nao_tenho', 'ja_tive'] }),
    favoritoPosicao: integer('favorito_posicao'),
    notasPrivadas: text('notas_privadas'),
    criadoEm: text('criado_em').notNull().default(agora),
    atualizadoEm: text('atualizado_em').notNull().default(agora)
  },
  (t) => [
    index('idx_livros_status').on(t.status),
    index('idx_livros_isbn13').on(t.isbn13),
    index('idx_livros_serie').on(t.serieId),
    uniqueIndex('idx_livros_favorito').on(t.favoritoPosicao),
    check('favorito_valido', sql`${t.favoritoPosicao} IS NULL OR ${t.favoritoPosicao} BETWEEN 1 AND 4`)
  ]
)

export const livroAutores = sqliteTable(
  'livro_autores',
  {
    livroId: integer('livro_id')
      .notNull()
      .references(() => livros.id, { onDelete: 'cascade' }),
    autorId: integer('autor_id')
      .notNull()
      .references(() => autores.id, { onDelete: 'restrict' }),
    papel: text('papel', { enum: ['autor', 'tradutor', 'ilustrador'] })
      .notNull()
      .default('autor'),
    ordem: integer('ordem').notNull().default(0)
  },
  (t) => [
    primaryKey({ columns: [t.livroId, t.autorId, t.papel] }),
    index('idx_livro_autores_autor').on(t.autorId)
  ]
)

export const classificacoes = sqliteTable(
  'classificacoes',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    tipo: text('tipo', { enum: ['genero', 'tema', 'mood'] }).notNull(),
    nome: text('nome').notNull(),
    ordem: integer('ordem').notNull()
  },
  (t) => [uniqueIndex('idx_classificacao_unica').on(t.tipo, t.nome)]
)

export const livroClassificacoes = sqliteTable(
  'livro_classificacoes',
  {
    livroId: integer('livro_id')
      .notNull()
      .references(() => livros.id, { onDelete: 'cascade' }),
    classificacaoId: integer('classificacao_id')
      .notNull()
      .references(() => classificacoes.id, { onDelete: 'restrict' }),
    ordem: integer('ordem').notNull().default(0)
  },
  (t) => [
    primaryKey({ columns: [t.livroId, t.classificacaoId] }),
    index('idx_livro_classificacoes_classificacao').on(t.classificacaoId)
  ]
)

export const leituras = sqliteTable(
  'leituras',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    livroId: integer('livro_id')
      .notNull()
      .references(() => livros.id, { onDelete: 'cascade' }),
    status: text('status', { enum: ['lendo', 'lido', 'pausado', 'abandonado'] }).notNull(),
    formato: text('formato', { enum: ['fisico', 'ebook', 'audiolivro'] }),
    dataInicio: text('data_inicio'),
    dataFim: text('data_fim'),
    anoFim: integer('ano_fim'),
    precisaoFim: text('precisao_fim', { enum: ['dia', 'ano'] }),
    nota: real('nota'),
    resenha: text('resenha'),
    criadoEm: text('criado_em').notNull().default(agora)
  },
  (t) => [
    index('idx_leituras_livro').on(t.livroId),
    index('idx_leituras_fim').on(t.dataFim),
    index('idx_leituras_ano').on(t.anoFim),
    check(
      'nota_meia_estrela',
      sql`${t.nota} IS NULL OR (${t.nota} BETWEEN 0.5 AND 5 AND ${t.nota} * 2 = CAST(${t.nota} * 2 AS INTEGER))`
    ),
    check(
      'data_coerente',
      sql`(${t.precisaoFim} IS NULL AND ${t.dataFim} IS NULL AND ${t.anoFim} IS NULL) OR (${t.precisaoFim} = 'dia' AND ${t.dataFim} IS NOT NULL) OR (${t.precisaoFim} = 'ano' AND ${t.dataFim} IS NULL AND ${t.anoFim} IS NOT NULL)`
    )
  ]
)

export const progresso = sqliteTable(
  'progresso',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    leituraId: integer('leitura_id')
      .notNull()
      .references(() => leituras.id, { onDelete: 'cascade' }),
    data: text('data').notNull(),
    pagina: integer('pagina').notNull()
  },
  (t) => [
    index('idx_progresso_leitura').on(t.leituraId),
    index('idx_progresso_data').on(t.data),
    check('pagina_valida', sql`${t.pagina} >= 0`)
  ]
)

export const citacoes = sqliteTable(
  'citacoes',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    livroId: integer('livro_id')
      .notNull()
      .references(() => livros.id, { onDelete: 'cascade' }),
    texto: text('texto').notNull(),
    pagina: integer('pagina'),
    criadoEm: text('criado_em').notNull().default(agora)
  },
  (t) => [index('idx_citacoes_livro').on(t.livroId)]
)

export const listas = sqliteTable('listas', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  nome: text('nome').notNull().unique(),
  descricao: text('descricao'),
  ordenada: integer('ordenada', { mode: 'boolean' }).notNull().default(false),
  criadoEm: text('criado_em').notNull().default(agora)
})

export const listaLivros = sqliteTable(
  'lista_livros',
  {
    listaId: integer('lista_id')
      .notNull()
      .references(() => listas.id, { onDelete: 'cascade' }),
    livroId: integer('livro_id')
      .notNull()
      .references(() => livros.id, { onDelete: 'cascade' }),
    posicao: integer('posicao').notNull()
  },
  (t) => [
    primaryKey({ columns: [t.listaId, t.livroId] }),
    index('idx_lista_livros_livro').on(t.livroId)
  ]
)

export const filaMeta = sqliteTable('fila_meta', {
  livroId: integer('livro_id')
    .primaryKey()
    .references(() => livros.id, { onDelete: 'cascade' }),
  posicao: integer('posicao').notNull()
})

export const metas = sqliteTable(
  'metas',
  {
    ano: integer('ano').primaryKey(),
    livros: integer('livros').notNull()
  },
  (t) => [check('meta_positiva', sql`${t.livros} > 0`)]
)

export const configuracoes = sqliteTable('configuracoes', {
  chave: text('chave').primaryKey(),
  valor: text('valor')
})
