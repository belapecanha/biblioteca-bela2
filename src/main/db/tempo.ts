// O SQLite grava CURRENT_TIMESTAMP em UTC, no formato AAAA-MM-DD HH:MM:SS. Um livro cadastrado
// às 22h em Brasília ficaria com a data do dia seguinte; esta expressão converte para o fuso do
// computador. Valores só com a data (AAAA-MM-DD, vindos da importação) já são locais e passam como estão.
export const horaLocal = (coluna: string): string =>
  `CASE WHEN length(${coluna}) = 19 THEN datetime(${coluna}, 'localtime') ELSE ${coluna} END`
