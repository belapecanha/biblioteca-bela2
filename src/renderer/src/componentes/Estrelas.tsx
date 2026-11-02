import { useState } from 'react'

const dec = (n: number) => String(n).replace('.', ',')

export function Estrelas({
  nota,
  aoMudar,
  grande = false
}: {
  nota: number | null
  aoMudar: (nota: number | null) => void
  grande?: boolean
}) {
  const [sobre, setSobre] = useState<number | null>(null)
  const mostrada = sobre ?? nota ?? 0
  const escolher = (valor: number) => aoMudar(nota === valor ? null : valor)

  return (
    <div className={grande ? 'estrelas grande' : 'estrelas'} role="group" aria-label="Sua nota" onMouseLeave={() => setSobre(null)}>
      {[1, 2, 3, 4, 5].map((i) => {
        const meio = i - 0.5
        const preenchido = mostrada >= i ? 100 : mostrada >= meio ? 50 : 0
        return (
          <span className="est" key={i}>
            <span aria-hidden="true">★</span>
            <span className="est-f" style={{ width: `${preenchido}%` }} aria-hidden="true">
              ★
            </span>
            <button
              type="button"
              className="est-m est-e"
              aria-label={`Dar nota ${dec(meio)}`}
              aria-pressed={nota === meio}
              onMouseEnter={() => setSobre(meio)}
              onClick={() => escolher(meio)}
            />
            <button
              type="button"
              className="est-m est-d"
              aria-label={`Dar nota ${i}`}
              aria-pressed={nota === i}
              onMouseEnter={() => setSobre(i)}
              onClick={() => escolher(i)}
            />
          </span>
        )
      })}
    </div>
  )
}
