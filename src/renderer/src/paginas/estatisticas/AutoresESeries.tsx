import { Link } from 'react-router-dom'
import { dec, fmt, media, variarSeries } from '@shared/estatisticas'
import { Capa } from '../../componentes/Capa'
import { COR, Secao, type PropsSecao, type Serie } from './componentes'

export function AutoresESeries({ S, f, alterna }: PropsSecao) {
  const pct = (s: { lidos: number; total: number }) => Math.round((s.lidos / s.total) * 100)
  return (
    <Secao titulo="Autores e séries">
      <div className="card">
        <h3>Autores mais lidos</h3>
        <div className="est-autores">
          {S.autoresVariados.slice(0, 6).map((x) => {
            const ns = x.notas.length > 1 ? x.notas : [x.notas[0] ?? 0, x.notas[0] ?? 0]
            return (
              <div key={x.id}>
                <div className="est-autor">
                  <button
                    type="button"
                    className="titulo-botao"
                    aria-pressed={f.autor === String(x.id)}
                    onClick={() => alterna('autor', x.id)}
                  >
                    {x.nome}
                  </button>
                  <p className="peq muted sem-margem">
                    {x.livros.length} {x.livros.length === 1 ? 'livro' : 'livros'}
                    {x.notas.length ? `, nota ${dec(media(x.notas))}` : ''}
                  </p>
                  <p className="peq sem-margem est-autor-links">
                    {x.membros.map((m) => (
                      <Link key={m.id} className="link" to={`/autor/${m.id}`}>
                        {x.membros.length > 1 ? m.nome : 'Ver página'}
                      </Link>
                    ))}
                  </p>
                  <svg viewBox="0 0 120 30" role="img" aria-label={`Notas de ${x.nome}`}>
                    <polyline
                      points={ns
                        .map(
                          (v, i) => `${Math.round(4 + (i * 112) / (ns.length - 1))},${Math.round(27 - (v / 5) * 24)}`
                        )
                        .join(' ')}
                      fill="none"
                      stroke={COR.roxo}
                      strokeWidth="2"
                    />
                  </svg>
                </div>
                <div className="est-autor-capas">
                  {variarSeries(x.livros)
                    .slice(0, 4)
                    .map((l) => (
                      <Link key={l.id} className="livro" to={`/livro/${l.id}`} aria-label={l.titulo} title={l.titulo}>
                        <Capa livro={l} />
                      </Link>
                    ))}
                </div>
              </div>
            )
          })}
        </div>
      </div>
      <div className="est-grade g340">
        {(
          [
            [
              'Séries por livros',
              COR.azul,
              [...S.series].filter((s) => s.lidos).sort((x, y) => pct(y) - pct(x) || y.lidos - x.lidos),
              (s: Serie) => `${s.lidos} de ${s.total}`
            ],
            [
              'Séries por páginas',
              COR.roxo,
              [...S.series].sort((x, y) => y.paginas - x.paginas),
              (s: Serie) => `${fmt(s.paginas)} páginas`
            ]
          ] as const
        ).map(([titulo, cor, lista, texto]) => (
          <div className="card" key={titulo}>
            <h3>{titulo}</h3>
            <div className="est-series">
              {lista.slice(0, 7).map((s) => (
                <div className="peq" key={s.nome}>
                  <span className="est-linha">
                    <span>{s.nome}</span>
                    <strong>{texto(s)}</strong>
                  </span>
                  <div role="img" aria-label={`${pct(s)}%`}>
                    <i style={{ width: `${pct(s)}%`, background: cor }} />
                  </div>
                </div>
              ))}
            </div>
            <p className="peq muted">Sobre os volumes cadastrados.</p>
          </div>
        ))}
      </div>
    </Secao>
  )
}
