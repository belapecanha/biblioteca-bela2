const dois = (n: number) => String(n).padStart(2, '0')

/** Data no fuso do computador, em AAAA-MM-DD (o mesmo formato das datas de leitura). */
export const dataLocal = (d: Date = new Date()): string =>
  `${d.getFullYear()}-${dois(d.getMonth() + 1)}-${dois(d.getDate())}`

/** Data e hora no fuso do computador, em AAAA-MM-DD HH:MM:SS. */
export const dataHoraLocal = (d: Date = new Date()): string =>
  `${dataLocal(d)} ${dois(d.getHours())}:${dois(d.getMinutes())}:${dois(d.getSeconds())}`
