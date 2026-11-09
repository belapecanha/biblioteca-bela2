// Remove acentos: depois da decomposição NFD, as marcas combinantes (categoria M) saem.
export const semAcentos = (t: string): string => t.normalize('NFD').replace(/\p{M}/gu, '')

/** Para buscas e comparações: sem acento, minúsculas e sem espaço nas pontas. */
export const simples = (t: string): string => semAcentos(t).trim().toLowerCase()

/** Para achar duplicados: só letras e números, sem acento nem pontuação. */
export const chaveTexto = (t: string): string => simples(t).replace(/[^a-z0-9]/g, '')

/** Conta ocorrências, da mais frequente para a menos; empate em ordem alfabética. */
export function contar(lista: string[]): [string, number][] {
  const mapa = new Map<string, number>()
  for (const item of lista) mapa.set(item, (mapa.get(item) ?? 0) + 1)
  return [...mapa.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], 'pt-BR'))
}
