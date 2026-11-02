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
  if (typeof valor !== 'string' || valor.length > limite || (!valor.trim() && obrigatorio)) throw new Error(`${nome}: texto inválido.`)
  return valor.trim() || null
}
export function numero(valor: unknown, nome: string, minimo = 0, maximo = 1000000, inteiro = true): number | null {
  if (valor === null || valor === undefined) return null
  if (typeof valor !== 'number' || !Number.isFinite(valor) || valor < minimo || valor > maximo || (inteiro && !Number.isInteger(valor))) {
    throw new Error(`${nome}: número inválido.`)
  }
  return valor
}
export function dataValida(valor: unknown): string | null {
  if (valor === null || valor === undefined || valor === '') return null
  if (typeof valor !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(valor) || valor.slice(0, 4) === '0000') throw new Error('Data inválida.')
  const data = new Date(`${valor}T12:00:00Z`)
  if (!Number.isFinite(data.getTime()) || data.toISOString().slice(0, 10) !== valor) throw new Error('Data inválida.')
  return valor
}
export function notaValida(valor: unknown): number | null {
  const nota = numero(valor, 'Nota', 0.5, 5, false)
  if (nota !== null && !Number.isInteger(nota * 2)) throw new Error('A nota deve usar meia estrela.')
  return nota
}
