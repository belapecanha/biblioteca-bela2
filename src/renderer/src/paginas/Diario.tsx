import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import type { LeituraDiario } from '@shared/api'
import { anosDoDiario, eventosDoMes, resumoDoMes, type EventoDiario } from '@shared/diario'
import { Capa, Estado } from '../componentes/Capa'
import { estrelasTexto, NOME_STATUS } from '../dados'
import { Escolha } from '../componentes/Formulario'

const MESES = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro']
export function Diario() {
  const consulta = useQuery({ queryKey: ['diario'], queryFn: () => window.bela.leituras.diario() })
  if (!consulta.data) return <Estado carregando={consulta.isLoading} erro={consulta.isError} aoTentar={() => void consulta.refetch()} />
  return <Calendario leituras={consulta.data} />
}
function Calendario({ leituras }: { leituras: LeituraDiario[] }) {
  const agora = new Date()
  const anos = anosDoDiario(leituras, agora.getFullYear())
  const [notaMinima, setNotaMinima] = useState('')
  const [formato, setFormato] = useState('')
  const [tipo, setTipo] = useState('')
  const filtradas = leituras.filter((l) => (!notaMinima || (l.nota ?? 0) >= Number(notaMinima)) && (!formato || (l.formato ?? l.livro.formato) === formato) && (!tipo || l.livro.tipo === tipo))
  const [periodo, setPeriodo] = useState(() => {
    const ano = anos.includes(agora.getFullYear()) ? agora.getFullYear() : anos.at(-1)!
    const datas = leituras.flatMap((l) => [l.dataInicio, l.dataFim, ...l.progresso.map((p) => p.data)]).filter((d): d is string => !!d && Number(d.slice(0, 4)) === ano).sort()
    return { ano, mes: ano === agora.getFullYear() ? agora.getMonth() + 1 : datas.length ? Number(datas.at(-1)!.slice(5, 7)) : 12 }
  })
  // Quando o último registro de um ano é corrigido, mantém a navegação dentro dos anos restantes.
  const ano = anos.includes(periodo.ano) ? periodo.ano : anos.at(-1)!
  const mes = periodo.mes
  const eventos = eventosDoMes(filtradas, ano, mes)
  const resumo = resumoDoMes(filtradas, ano, mes)
  const semDia = filtradas.filter((l) => l.status === 'lido' && l.precisaoFim === 'ano' && l.anoFim === ano)
  const semData = filtradas.filter((l) => l.status === 'lido' && l.precisaoFim === null)
  const doMes = [...new Map(eventos.map((e) => [e.leitura.id, e.leitura])).values()]
  const inicio = (new Date(ano, mes - 1, 1).getDay() + 6) % 7
  const dias = new Date(ano, mes, 0).getDate()
  const navegar = (delta: number) => {
    let novoMes = mes + delta
    let novoAno = ano
    if (novoMes < 1) { novoMes = 12; novoAno = anos[anos.indexOf(ano) - 1] ?? ano }
    if (novoMes > 12) { novoMes = 1; novoAno = anos[anos.indexOf(ano) + 1] ?? ano }
    setPeriodo({ ano: novoAno, mes: novoMes })
  }
  function cartoes(lista: LeituraDiario[]) {
    return <div className="diario-leituras">{lista.map((l) => <Link className="diario-leitura card" key={l.id} to={`/livro/${l.livro.id}`}><Capa livro={l.livro} /><div><h3>{l.livro.titulo}</h3><p className="muted peq">{l.livro.autores.map((a) => a.nome).join(', ')}</p><p className="peq">{NOME_STATUS[l.status]}{l.dataFim ? ` · ${new Date(`${l.dataFim}T12:00`).toLocaleDateString('pt-BR')}` : l.anoFim ? ` · ${l.anoFim}, sem dia exato` : ' · sem data'}</p><span className="nota">{estrelasTexto(l.nota)}</span>{l.resenha && <p className="diario-resenha muted peq">{l.resenha}</p>}</div></Link>)}</div>
  }
  return <main className="wrap pagina diario">
    <div className="cabeca"><div><p className="sobretitulo">Uma página de cada vez</p><h1>Diário de leitura</h1></div><Link className="btn btn2" to="/estante">Registrar na ficha de um livro</Link></div>
    <div className="diario-layout"><div className="diario-principal coluna">
    <div className="cabeca diario-periodo"><button className="btn btn2" type="button" aria-label="Mês anterior" disabled={ano === anos[0] && mes === 1} onClick={() => navegar(-1)}>Anterior</button><h2>{MESES[mes - 1]} <em>{ano}</em></h2><button className="btn btn2" type="button" aria-label="Próximo mês" disabled={ano === anos.at(-1) && mes === 12} onClick={() => navegar(1)}>Próximo</button>
    </div>
    <div className="diario-numeros">{[[resumo.concluidas, 'Leituras concluídas'], [resumo.paginas.toLocaleString('pt-BR'), 'Páginas registradas'], [Math.round(resumo.paginas / dias).toLocaleString('pt-BR'), 'Páginas por dia']].map(([v, n]) => <div className="card" key={n}><p className="num">{v}</p><span className="muted peq">{n}</span></div>)}</div>
    <div className="linha peq muted calendario-legenda"><span><i className="ponto inicio" />Início</span><span><i className="ponto progresso" />Progresso</span><span><i className="ponto fim" />Conclusão</span></div>
    <section className="calendario" aria-label={`Calendário de ${MESES[mes - 1]} de ${ano}`}>
      {['Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb', 'Dom'].map((dia) => <div className="calendario-semana" key={dia}>{dia}</div>)}
      {Array.from({ length: inicio }, (_, i) => <div className="calendario-dia vazio" key={`v${i}`} aria-hidden="true" />)}
      {Array.from({ length: dias }, (_, i) => {
        const dia = i + 1
        const data = `${ano}-${String(mes).padStart(2, '0')}-${String(dia).padStart(2, '0')}`
        const doDia = new Map<number, EventoDiario>()
        for (const e of eventos.filter((e) => e.data === data)) doDia.set(e.leitura.id, e)
        const atual = dia === agora.getDate() && mes === agora.getMonth() + 1 && ano === agora.getFullYear()
        return <div key={dia} className={`calendario-dia ${atual ? 'hoje' : ''}`}><span className="dia-numero">{dia}</span><div className="dia-capas">{[...doDia.values()].map((e) => <Link key={e.leitura.id} className={`dia-livro ${e.tipo}`} to={`/livro/${e.leitura.livro.id}`} title={`${e.leitura.livro.titulo} · ${e.tipo === 'fim' ? 'Concluído' : e.tipo === 'inicio' ? 'Iniciado' : `Página ${e.pagina}`}`} aria-label={`${e.leitura.livro.titulo}, ${e.tipo === 'fim' ? 'concluído' : e.tipo === 'inicio' ? 'iniciado' : `página ${e.pagina}`} em ${dia}/${mes}/${ano}`}><Capa livro={e.leitura.livro} /><span>{e.tipo === 'fim' ? '✓' : e.tipo === 'inicio' ? 'Início' : `p. ${e.pagina}`}</span></Link>)}</div></div>
      })}
    </section>
    {!leituras.length && <p className="muted">Seu diário começa com a primeira leitura. Abra um livro na estante para registrar as datas e o progresso.</p>}
    </div><aside className="diario-lado coluna"><div className="form-grid">
      <Escolha rotulo="Ano do diário" valor={String(ano)} aoMudar={(v) => setPeriodo({ ano: Number(v), mes })} opcoes={anos.map((a) => [String(a), String(a)])} />
      <Escolha rotulo="Mês do diário" valor={String(mes)} aoMudar={(v) => setPeriodo({ ano, mes: Number(v) })} opcoes={MESES.map((m, i) => [String(i + 1), m])} />
      <Escolha rotulo="Nota mínima" valor={notaMinima} aoMudar={setNotaMinima} opcoes={[[ '', 'Todas' ], ...Array.from({ length: 10 }, (_, i): [string, string] => [String((i + 1) / 2), `${String((i + 1) / 2).replace('.', ',')} ou mais`])]} />
      <Escolha rotulo="Formato no diário" valor={formato} aoMudar={setFormato} opcoes={[[ '', 'Todos' ], ['fisico', 'Físico'], ['ebook', 'E-book'], ['audiolivro', 'Audiolivro']]} />
      <Escolha rotulo="Tipo no diário" valor={tipo} aoMudar={setTipo} opcoes={[[ '', 'Todos' ], ['livro', 'Livro'], ['manhwa', 'Manhwa'], ['manga', 'Mangá'], ['graphic_novel', 'Graphic novel'], ['poesia', 'Poesia']]} />
    </div><section><div className="sec"><h2>Leituras do mês</h2></div><p className="muted peq">{doMes.length} com atividade · {resumo.iniciadas} iniciadas{resumo.notaMedia ? ` · nota média ${resumo.notaMedia.toLocaleString('pt-BR', { maximumFractionDigits: 1 })}` : ''}</p>{doMes.length ? cartoes(doMes) : <p className="muted">Nenhuma atividade registrada neste mês.</p>}</section></aside></div>
    <section><div className="sec"><h2>Sem dia exato · {ano}</h2><span className="muted peq">{semDia.length} leituras</span></div><p className="muted peq">Estas leituras pertencem ao ano, sem atribuir um mês ou um dia que você não registrou.</p>{semDia.length ? cartoes(semDia) : <p className="muted">Nenhuma leitura com data aproximada neste ano.</p>}</section>
    {!!semData.length && <section><div className="sec"><h2>Sem data registrada</h2><span className="muted peq">{semData.length} leituras</span></div><p className="muted peq">Não entram nos números de um mês ou ano. Você pode corrigir as datas na ficha de cada livro.</p>{cartoes(semData)}</section>}
  </main>
}
