import { fmt } from '@shared/estatisticas'
import { anoCurto, COR, Coluna, Secao, type PropsSecao } from './componentes'

export function AoLongoDoTempo({
  S,
  f,
  alterna,
  ano,
  aoMudarAno
}: PropsSecao & { ano: number | null; aoMudarAno: (ano: string) => void }) {
  const a = ano
  const setAno = aoMudarAno
  const anosK = [...S.porAno.keys()].sort((x, y) => x - y)
  const maxLivros = Math.max(1, ...anosK.map((k) => S.porAno.get(k)!.livros))
  const maxPaginas = Math.max(1, ...anosK.map((k) => S.porAno.get(k)!.paginas))
  const pontos = anosK.map((k, i) => ({
    k,
    x: Math.round(18 + (i * 484) / Math.max(1, anosK.length - 1)),
    y: Math.round(198 - (S.porAno.get(k)!.paginas / maxPaginas) * 180)
  }))
  const maxMes = Math.max(1, ...S.meses.map((m) => m.q))
  const maxDecada = Math.max(1, ...S.decadas.map((d) => d[1]))
  return (
    <Secao titulo="Ao longo do tempo">
      <div className="est-grade g440">
        <div className="card">
          <h3>Livros por ano</h3>
          <div className="est-barras" style={{ height: 220 }}>
            {anosK.map((k) => (
              <Coluna
                key={k}
                titulo={`${k}: ${S.porAno.get(k)!.livros} livros`}
                rotulo={anoCurto(k)}
                valor={S.porAno.get(k)!.livros}
                altura={Math.round((S.porAno.get(k)!.livros / maxLivros) * 160)}
                cor={a === k ? COR.roxo : '#58707F'}
                marcada={a === k}
                aoClicar={() => setAno(a === k ? '' : String(k))}
              />
            ))}
          </div>
        </div>
        <div className="card">
          <h3>Páginas por ano</h3>
          <svg className="est-svg" viewBox="0 0 520 230" role="img" aria-label="Páginas lidas por ano">
            <line x1="0" y1="198" x2="520" y2="198" stroke="#3D4D5A" />
            <polyline
              points={pontos.map((p) => `${p.x},${p.y}`).join(' ')}
              fill="none"
              stroke={COR.azul}
              strokeWidth="2"
            />
            {pontos.map((p) => (
              <g key={p.k}>
                <circle cx={p.x} cy={p.y} r="5" fill={COR.azul} stroke="#25323C" strokeWidth="2">
                  <title>{`${p.k}: ${fmt(S.porAno.get(p.k)!.paginas)} páginas`}</title>
                </circle>
                <text x={p.x} y="218" textAnchor="middle" fontSize="12" fill="#B9C3C9">
                  {anoCurto(p.k)}
                </text>
              </g>
            ))}
          </svg>
        </div>
        <div className="card">
          <h3>Livros por mês</h3>
          <div className="est-barras" style={{ height: 150 }}>
            {S.meses.map((m) => (
              <Coluna
                key={m.m}
                titulo={`${m.m}: ${m.q}`}
                rotulo={m.m}
                valor={m.q}
                altura={Math.round((m.q / maxMes) * 90)}
                marcada={f.mes === String(m.i + 1)}
                aoClicar={() => alterna('mes', m.i + 1)}
              />
            ))}
          </div>
          <p className="peq muted">Só considera leituras com data exata.</p>
        </div>
        <div className="card">
          <h3>Ano de publicação</h3>
          <div className="est-barras" style={{ height: 150 }}>
            {S.decadas.map(([d, q]) => (
              <Coluna
                key={d}
                titulo={`década de ${d}: ${q}`}
                rotulo={`'${String(d).slice(2, 3)}0`}
                valor={q}
                altura={Math.max(3, Math.round((q / maxDecada) * 96))}
                cor={COR.azul}
                marcada={f.decada === String(d)}
                aoClicar={() => alterna('decada', d)}
              />
            ))}
          </div>
          <p className="peq muted">Por década.</p>
        </div>
      </div>
    </Secao>
  )
}
