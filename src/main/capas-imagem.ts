import sharp from 'sharp'

export interface CoresCapa {
  principal: string
  destaque1: string
  destaque2: string
  texto: string
}

const LARGURA_MINIATURA = 300

export async function criarMiniatura(origem: string | Buffer, destino: string): Promise<void> {
  await sharp(origem)
    .resize({ width: LARGURA_MINIATURA, withoutEnlargement: true })
    .webp({ quality: 80 })
    .toFile(destino)
}

interface Grupo {
  r: number
  g: number
  b: number
  n: number
  matiz: number
  saturacao: number
  valor: number
  fracao: number
}

function paraHex(r: number, g: number, b: number): string {
  const parte = (v: number) => Math.round(v).toString(16).padStart(2, '0')
  return `#${parte(r)}${parte(g)}${parte(b)}`.toUpperCase()
}

function hsv(r: number, g: number, b: number): [number, number, number] {
  const [x, y, z] = [r / 255, g / 255, b / 255]
  const max = Math.max(x, y, z)
  const d = max - Math.min(x, y, z)
  if (d === 0) return [0, 0, max]
  const h = max === x ? ((y - z) / d + 6) % 6 : max === y ? (z - x) / d + 2 : (x - y) / d + 4
  return [h / 6, d / max, max]
}

function distanciaMatiz(a: number, b: number): number {
  const d = Math.abs(a - b)
  return Math.min(d, 1 - d)
}

// A principal pinta a lombada. As de destaque são as mais vivas e presentes na capa.
export async function extrairCores(origem: string | Buffer): Promise<CoresCapa> {
  const { data, info } = await sharp(origem)
    .resize(60, 90, { fit: 'fill' })
    .removeAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true })

  const baldes = new Map<number, { r: number; g: number; b: number; n: number }>()
  for (let i = 0; i < data.length; i += info.channels) {
    const chave = ((data[i] >> 4) << 8) | ((data[i + 1] >> 4) << 4) | (data[i + 2] >> 4)
    const balde = baldes.get(chave) ?? { r: 0, g: 0, b: 0, n: 0 }
    balde.r += data[i]
    balde.g += data[i + 1]
    balde.b += data[i + 2]
    balde.n += 1
    baldes.set(chave, balde)
  }

  const total = data.length / info.channels
  const grupos: Grupo[] = [...baldes.values()].map((b) => {
    const [r, g, c] = [b.r / b.n, b.g / b.n, b.b / b.n]
    const [matiz, saturacao, valor] = hsv(r, g, c)
    return { r, g, b: c, n: b.n, matiz, saturacao, valor, fracao: b.n / total }
  })

  const principal = grupos.reduce((a, b) => (b.n > a.n ? b : a))
  const pontuar = (g: Grupo) => (g.saturacao + 0.15) * Math.sqrt(g.fracao)
  let vivas = grupos.filter((g) => g.valor > 0.28 && g.fracao > 0.015).sort((a, b) => pontuar(b) - pontuar(a))
  if (!vivas.length) vivas = [...grupos].sort((a, b) => b.valor - a.valor)

  const d1 = vivas[0]
  const d2 =
    vivas.slice(1).find((g) => distanciaMatiz(g.matiz, d1.matiz) > 0.06 || Math.abs(g.valor - d1.valor) > 0.25) ?? d1
  const luminancia = 0.299 * principal.r + 0.587 * principal.g + 0.114 * principal.b

  return {
    principal: paraHex(principal.r, principal.g, principal.b),
    destaque1: paraHex(d1.r, d1.g, d1.b),
    destaque2: paraHex(d2.r, d2.g, d2.b),
    texto: luminancia > 135 ? '#1D262E' : '#F6EDE1'
  }
}
