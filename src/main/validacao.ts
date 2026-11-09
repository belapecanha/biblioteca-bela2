import { LIMITE_IMAGEM, NOTA_MAXIMA, NOTA_MINIMA, pertence } from '@shared/dominio'

export function objeto(valor: unknown): asserts valor is Record<string, unknown> {
  if (!valor || typeof valor !== 'object' || Array.isArray(valor)) throw new Error('Dados inválidos.')
}
export function idValido(id: unknown): asserts id is number {
  if (!Number.isInteger(id) || (id as number) <= 0) throw new Error('Identificador inválido.')
}
export function texto(valor: unknown, nome: string, limite = 10000, obrigatorio = false): string | null {
  if (valor === null || valor === undefined || valor === '') {
    if (obrigatorio) throw new Error(`Preencha ${nome}.`)
    return null
  }
  if (typeof valor !== 'string' || valor.length > limite || (!valor.trim() && obrigatorio))
    throw new Error(`${nome}: texto inválido.`)
  return valor.trim() || null
}
export function numero(valor: unknown, nome: string, minimo = 0, maximo = 1000000, inteiro = true): number | null {
  if (valor === null || valor === undefined) return null
  if (
    typeof valor !== 'number' ||
    !Number.isFinite(valor) ||
    valor < minimo ||
    valor > maximo ||
    (inteiro && !Number.isInteger(valor))
  ) {
    throw new Error(`${nome}: número inválido.`)
  }
  return valor
}
export function dataValida(valor: unknown): string | null {
  if (valor === null || valor === undefined || valor === '') return null
  if (typeof valor !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(valor) || valor.slice(0, 4) === '0000')
    throw new Error('Data inválida.')
  const data = new Date(`${valor}T12:00:00Z`)
  if (!Number.isFinite(data.getTime()) || data.toISOString().slice(0, 10) !== valor) throw new Error('Data inválida.')
  return valor
}
export function notaValida(valor: unknown): number | null {
  if (valor === null || valor === undefined) return null
  if (
    typeof valor !== 'number' ||
    !Number.isFinite(valor) ||
    valor < NOTA_MINIMA ||
    valor > NOTA_MAXIMA ||
    !Number.isInteger(valor * 2)
  ) {
    throw new Error('Nota inválida: use meia estrela, de 0,5 a 5.')
  }
  return valor
}

/** Um valor de uma lista de domínio (status, tipo, formato...). */
export function opcao<T extends string>(lista: readonly T[], valor: unknown, nome: string): T {
  if (!pertence(lista, valor)) throw new Error(`${nome} inválido.`)
  return valor
}
export function opcaoOuNulo<T extends string>(lista: readonly T[], valor: unknown, nome: string): T | null {
  return valor === null ? null : opcao(lista, valor, nome)
}

/** Bytes de uma imagem enviada pela interface (Uint8Array pelo IPC). O sharp confere o conteúdo. */
export function bytesImagem(valor: unknown): Buffer {
  if (!(valor instanceof Uint8Array) || valor.byteLength === 0 || valor.byteLength > LIMITE_IMAGEM)
    throw new Error('Escolha uma imagem de até 15 MB.')
  return Buffer.from(valor.buffer, valor.byteOffset, valor.byteLength)
}

export function idsValidos(ids: unknown, limite = 10000): asserts ids is number[] {
  if (!Array.isArray(ids) || ids.length > limite) throw new Error('Seleção inválida.')
  ids.forEach(idValido)
  if (new Set(ids).size !== ids.length) throw new Error('A seleção contém livros repetidos.')
}
