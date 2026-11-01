import { join, resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { resolverCapa } from '../../src/main/capas'

const capas = resolve('dados-teste/capas')
const miniaturas = resolve('dados-teste/miniaturas')
const resolver = (url: string) => resolverCapa(capas, miniaturas, url)

describe('protocolo de capas', () => {
  it('encontra arquivos das duas pastas', () => {
    expect(resolver('capa://original/caraval.webp')).toBe(join(capas, 'caraval.webp'))
    expect(resolver('capa://miniatura/caraval.webp')).toBe(join(miniaturas, 'caraval.webp'))
    expect(resolver('capa://original/capa%20nova.webp')).toBe(join(capas, 'capa nova.webp'))
  })

  it('recusa caminhos fora das pastas', () => {
    expect(resolver('capa://original/..%2F..%2Fbiblioteca.db')).toBeNull()
    expect(resolver('capa://original/..%5C..%5Cbiblioteca.db')).toBeNull()
    expect(resolver('capa://original/a/b.webp')).toBeNull()
    expect(resolver('capa://original/%E0%A4%A')).toBeNull()
    expect(resolver('capa://outra/caraval.webp')).toBeNull()
    expect(resolver('capa://original/')).toBeNull()
  })
})
