import { dec, media } from '@shared/estatisticas'
import { codigoDoPais, nomeDoPais } from '@shared/paises'
import mapaMundi from '../../mapa-mundi.json'
import {
  COR,
  Coluna,
  FORMATOS,
  notaTexto,
  Ranking,
  Rosca,
  Secao,
  tomCalor,
  tomMapa,
  type PropsSecao
} from './componentes'

export function PerfilDeLeitura({ S, f, alterna, setF }: PropsSecao) {
  const maxNota = Math.max(1, ...S.notasDist.map((n) => n[1]))
  const moodsCalor = S.moods.slice(0, 6).map((m) => m[0])
  const generosCalor = S.generos.slice(0, 6).map((g) => g[0])
  const qPais = new Map<string, { nome: string; q: number }>()
  for (const [nome, q] of S.paises) {
    const codigo = codigoDoPais(nome)
    if (codigo) qPais.set(codigo, { nome, q: (qPais.get(codigo)?.q ?? 0) + q })
  }
  const qFormato = (k: string) => S.formatos.find((x) => x[0] === k)?.[1] ?? 0
  const formatos = [
    ['fisico', COR.roxo],
    ['ebook', COR.azul],
    ['audiolivro', COR.dourado],
    ['sem', COR.neutro]
  ].filter(([k]) => k !== 'audiolivro' || qFormato(k) > 0)
  return (
    <Secao titulo="Perfil de leitura">
      <div className="est-grade g290">
        <Rosca
          titulo="Ficção e não ficção"
          itens={[
            { nome: 'Ficção', v: S.ficcao, cor: COR.roxo, aoClicar: () => alterna('classe', 'sim') },
            { nome: 'Não ficção', v: S.naoFiccao, cor: COR.azul, aoClicar: () => alterna('classe', 'nao') },
            { nome: 'Sem dado', v: S.semClasse, cor: COR.neutro, aoClicar: () => alterna('classe', 'sem') }
          ]}
        />
        <Rosca
          titulo="Formato"
          itens={formatos.map(([k, cor]) => ({
            nome: k === 'sem' ? 'Sem dado' : FORMATOS[k],
            v: qFormato(k),
            cor,
            aoClicar: () => alterna('formato', k)
          }))}
        />
        <div className="card">
          <h3>Distribuição de notas</h3>
          <div className="est-barras" style={{ height: 132 }}>
            {S.notasDist.map(([v, q]) => (
              <Coluna
                key={v}
                titulo={`nota ${notaTexto(v)}: ${q}`}
                rotulo={notaTexto(v)}
                valor={q}
                altura={Math.round((q / maxNota) * 86)}
                marcada={f.nota === String(v)}
                aoClicar={() => alterna('nota', v)}
              />
            ))}
          </div>
        </div>
        <Ranking
          titulo="Gêneros"
          cor={COR.roxo}
          itens={S.generos}
          ativo={f.genero}
          aoClicar={(v) => alterna('genero', v)}
        />
        <Ranking titulo="Temas" cor={COR.dourado} itens={S.temas} ativo={f.tema} aoClicar={(v) => alterna('tema', v)} />
        <Ranking titulo="Moods" cor={COR.azul} itens={S.moods} ativo={f.mood} aoClicar={(v) => alterna('mood', v)} />
        <Ranking titulo="Tipos" cor={COR.dourado} itens={S.tipos} ativo={f.tipo} aoClicar={(v) => alterna('tipo', v)} />
      </div>
      <div className="card">
        <h3>Nota média por gênero e mood</h3>
        <div className="est-calor">
          <table>
            <thead>
              <tr>
                <th scope="col">
                  <span className="oculto">Gênero</span>
                </th>
                {moodsCalor.map((h) => (
                  <th key={h} scope="col">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {generosCalor.map((g) => (
                <tr key={g}>
                  <th scope="row">{g}</th>
                  {moodsCalor.map((h) => {
                    const notas = S.calor.get(`${g}|${h}`) ?? []
                    const m = media(notas)
                    const [fundo, texto] = notas.length >= 3 ? tomCalor(m) : ['#2C3944', '#F3E9DC']
                    const titulo =
                      notas.length >= 3
                        ? `${g} e ${h}: nota ${dec(m)}, ${notas.length} leituras`
                        : `${g} e ${h}: poucos livros`
                    return (
                      <td key={h} title={titulo} style={{ background: fundo }}>
                        <button
                          type="button"
                          aria-label={titulo}
                          style={{ color: texto }}
                          onClick={() => setF((x) => ({ ...x, genero: g, mood: h }))}
                        >
                          {notas.length >= 3 ? dec(m) : ''}
                        </button>
                      </td>
                    )
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="peq muted">Cor mais clara significa nota mais alta. Mostra combinações com 3 ou mais leituras.</p>
      </div>
      <div className="card">
        <h3>Países de publicação</h3>
        <div className="est-mapa">
          <svg
            viewBox="0 0 936 390"
            role="img"
            aria-label={S.paises.map((p) => `${p[0]} ${p[1]}`).join(', ') || 'Sem países neste recorte'}
          >
            {(mapaMundi as [string, string][]).map(([codigo, d], i) => {
              const p = qPais.get(codigo)
              const nome = p?.nome ?? nomeDoPais(codigo)
              return (
                <path
                  key={i}
                  d={d}
                  fill={p && f.pais === p.nome ? COR.dourado : tomMapa(p?.q ?? 0)}
                  stroke="#25323C"
                  strokeWidth=".7"
                  style={{ cursor: p ? 'pointer' : 'default' }}
                  onClick={p ? () => alterna('pais', p.nome) : undefined}
                >
                  <title>{`${nome}: ${p?.q ?? 0}`}</title>
                </path>
              )
            })}
          </svg>
          <div className="peq est-paises">
            {S.paises.slice(0, 8).map(([nome, v]) => (
              <button key={nome} type="button" aria-pressed={f.pais === nome} onClick={() => alterna('pais', nome)}>
                <span>{nome}</span>
                <strong>{v}</strong>
              </button>
            ))}
            {!S.paises.length && <p className="muted">Sem país de publicação neste recorte.</p>}
          </div>
        </div>
      </div>
    </Secao>
  )
}
