import type { LeituraDiario } from './api'

export function anosDoDiario(leituras: LeituraDiario[], anoAtual: number): number[] {
  const anos = new Set<number>()
  for (const l of leituras) {
    for (const data of [l.dataInicio, l.dataFim, ...l.progresso.map((p) => p.data)]) if (data) anos.add(Number(data.slice(0, 4)))
    if (l.anoFim) anos.add(l.anoFim)
  }
  return anos.size ? [...anos].sort((a, b) => a - b) : [anoAtual]
}
export interface EventoDiario { data: string; leitura: LeituraDiario; tipo: 'inicio' | 'progresso' | 'fim'; pagina?: number }
export function eventosDoMes(leituras: LeituraDiario[], ano: number, mes: number): EventoDiario[] {
  const prefixo = `${ano}-${String(mes).padStart(2, '0')}`
  const eventos: EventoDiario[] = []
  for (const l of leituras) {
    if (l.dataInicio?.startsWith(prefixo)) eventos.push({ data: l.dataInicio, leitura: l, tipo: 'inicio' })
    for (const p of l.progresso) if (p.data.startsWith(prefixo)) eventos.push({ data: p.data, leitura: l, tipo: 'progresso', pagina: p.pagina })
    if (l.status === 'lido' && l.precisaoFim === 'dia' && l.dataFim?.startsWith(prefixo)) eventos.push({ data: l.dataFim, leitura: l, tipo: 'fim' })
  }
  return eventos.sort((a, b) => a.data.localeCompare(b.data))
}
export function resumoDoMes(leituras: LeituraDiario[], ano: number, mes: number) {
  const prefixo = `${ano}-${String(mes).padStart(2, '0')}`
  const concluidas = leituras.filter((l) => l.status === 'lido' && l.precisaoFim === 'dia' && l.dataFim?.startsWith(prefixo))
  let paginas = 0
  for (const l of leituras) {
    let anterior = 0
    for (const p of [...l.progresso].sort((a, b) => a.data.localeCompare(b.data) || a.id - b.id)) {
      if (p.data.startsWith(prefixo)) paginas += Math.max(0, p.pagina - anterior)
      anterior = p.pagina
    }
    if (concluidas.includes(l) && l.livro.paginas) {
      const ultimo = [...l.progresso].filter((p) => p.data <= l.dataFim!).sort((a, b) => b.data.localeCompare(a.data) || b.id - a.id)[0]?.pagina ?? 0
      paginas += Math.max(0, l.livro.paginas - ultimo)
    }
  }
  const notas = concluidas.flatMap((l) => l.nota === null ? [] : [l.nota])
  return {
    concluidas: concluidas.length,
    iniciadas: leituras.filter((l) => l.dataInicio?.startsWith(prefixo)).length,
    paginas,
    notaMedia: notas.length ? notas.reduce((a, b) => a + b, 0) / notas.length : null
  }
}
