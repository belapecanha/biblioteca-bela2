const CODIGOS = 'AD AE AF AG AI AL AM AO AQ AR AS AT AU AW AX AZ BA BB BD BE BF BG BH BI BJ BL BM BN BO BQ BR BS BT BV BW BY BZ CA CC CD CF CG CH CI CK CL CM CN CO CR CU CV CW CX CY CZ DE DJ DK DM DO DZ EC EE EG EH ER ES ET FI FJ FK FM FO FR GA GB GD GE GF GG GH GI GL GM GN GP GQ GR GS GT GU GW GY HK HM HN HR HT HU ID IE IL IM IN IO IQ IR IS IT JE JM JO JP KE KG KH KI KM KN KP KR KW KY KZ LA LB LC LI LK LR LS LT LU LV LY MA MC MD ME MF MG MH MK ML MM MN MO MP MQ MR MS MT MU MV MW MX MY MZ NA NC NE NF NG NI NL NO NP NR NU NZ OM PA PE PF PG PH PK PL PM PN PR PS PT PW PY QA RE RO RS RU RW SA SB SC SD SE SG SH SI SJ SK SL SM SN SO SR SS ST SV SX SY SZ TC TD TF TG TH TJ TK TL TM TN TO TR TT TV TW TZ UA UG UM US UY UZ VA VC VE VG VI VN VU WF WS XK YE YT ZA ZM ZW'

const nomes = new Intl.DisplayNames('pt-BR', { type: 'region' })
export const PAISES: string[] = CODIGOS.split(' ').map((c) => nomes.of(c) ?? c).sort((a, b) => a.localeCompare(b, 'pt-BR'))

export const simples = (t: string) => t.normalize('NFD').replace(/[̀-ͯ]/g, '').trim().toLowerCase()

export function exatoEm(lista: string[], texto: string): string | undefined {
  return lista.find((p) => simples(p) === simples(texto))
}

// Quem começa com as letras digitadas vem antes de quem só as contém no meio do nome.
export function filtrarPorTexto(lista: string[], texto: string): string[] {
  const busca = simples(texto)
  if (!busca) return lista
  const comeca = lista.filter((p) => simples(p).startsWith(busca))
  return [...comeca, ...lista.filter((p) => !comeca.includes(p) && simples(p).includes(busca))]
}

export const paisExato = (texto: string) => exatoEm(PAISES, texto)
export const filtrarPaises = (texto: string) => filtrarPorTexto(PAISES, texto)
