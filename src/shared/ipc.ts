import type { ApiBela } from './api'

// Contrato único do IPC. Cada função de `window.bela` aparece aqui uma vez, com o nome do
// canal e o tipo: 'leitura' roda na hora; 'escrita' entra numa fila e só começa quando a
// escrita anterior termina. O preload gera a API a partir desta tabela e o main registra os
// handlers por ela, então um canal digitado errado ou esquecido vira erro de compilação.
export type TipoCanal = 'leitura' | 'escrita'
export type Canal = readonly [canal: string, tipo: TipoCanal]

/** A API que passa pelo `invoke`; `registrarErro` é um evento sem resposta, à parte. */
export type ApiInvocavel = Omit<ApiBela, 'registrarErro'>

export type ContratoDe<T> = {
  [K in keyof T]: T[K] extends (...args: never[]) => unknown ? Canal : ContratoDe<T[K]>
}

export const CANAL_ERRO = 'app:erro'

export const CONTRATO = {
  estado: ['app:estado', 'leitura'],
  livros: {
    listar: ['livros:listar', 'leitura'],
    obter: ['livros:obter', 'leitura'],
    definirNota: ['livros:nota', 'escrita'],
    definirStatus: ['livros:status', 'escrita'],
    definirPosse: ['livros:posse', 'escrita'],
    definirClassificacoes: ['livros:classificacoes', 'escrita'],
    salvar: ['livros:salvar', 'escrita'],
    duplicados: ['livros:duplicados', 'leitura'],
    trocarCapa: ['livros:capa', 'escrita'],
    salvarNotas: ['livros:notas', 'escrita'],
    editoras: ['livros:editoras', 'leitura'],
    excluir: ['livros:excluir', 'escrita']
  },
  autoria: {
    obter: ['autoria:obter', 'leitura'],
    editar: ['autoria:editar', 'escrita']
  },
  leituras: {
    salvar: ['leituras:salvar', 'escrita'],
    progresso: ['leituras:progresso', 'escrita'],
    removerProgresso: ['leituras:remover-progresso', 'escrita'],
    salvarCitacao: ['leituras:citacao', 'escrita'],
    removerCitacao: ['leituras:remover-citacao', 'escrita'],
    diario: ['leituras:diario', 'leitura'],
    excluir: ['leituras:excluir', 'escrita']
  },
  google: {
    configuracao: ['google:configuracao', 'leitura'],
    buscar: ['google:buscar', 'leitura']
  },
  analise: {
    base: ['analise:base', 'leitura'],
    definirMeta: ['analise:meta', 'escrita'],
    definirFavoritosDoAno: ['analise:favoritos-ano', 'escrita'],
    salvarImagem: ['analise:salvar-imagem', 'escrita']
  },
  perfil: {
    dados: ['perfil:dados', 'leitura'],
    painel: ['perfil:painel', 'leitura'],
    salvar: ['perfil:salvar', 'escrita'],
    favoritos: ['perfil:favoritos', 'escrita'],
    fila: ['perfil:fila', 'escrita'],
    pendencias: ['perfil:pendencias', 'leitura']
  },
  listas: {
    listar: ['listas:listar', 'leitura'],
    obter: ['listas:obter', 'leitura'],
    salvar: ['listas:salvar', 'escrita'],
    adicionar: ['listas:adicionar', 'escrita'],
    removerLivro: ['listas:remover', 'escrita'],
    ordenar: ['listas:ordenar', 'escrita'],
    excluir: ['listas:excluir', 'escrita']
  },
  arquivos: {
    prepararCsv: ['arquivos:preparar-csv', 'escrita'],
    importarCsv: ['arquivos:importar-csv', 'escrita'],
    exportarCsv: ['arquivos:exportar-csv', 'escrita'],
    backup: ['arquivos:backup', 'escrita'],
    prepararRestauracao: ['arquivos:preparar-restauracao', 'escrita'],
    restaurar: ['arquivos:restaurar', 'escrita'],
    imagensOrfas: ['arquivos:imagens-orfas', 'leitura'],
    limparImagens: ['arquivos:limpar-imagens', 'escrita']
  }
} as const satisfies ContratoDe<ApiInvocavel>

/** O que o main devolve em todo canal: a interface nunca interpreta o texto de erro do Electron. */
export type Resposta<T> = { ok: true; dados: T } | { ok: false; erro: string }

/** Percorre o contrato chamando `folha` para cada canal, com o caminho da função. */
export function percorrerContrato(
  contrato: object,
  folha: (caminho: string[], canal: Canal) => void,
  caminho: string[] = []
): void {
  for (const [nome, valor] of Object.entries(contrato)) {
    if (Array.isArray(valor)) folha([...caminho, nome], valor as unknown as Canal)
    else percorrerContrato(valor as object, folha, [...caminho, nome])
  }
}
