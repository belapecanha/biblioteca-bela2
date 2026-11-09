import { ipcMain, type IpcMainInvokeEvent } from 'electron'
import { CONTRATO, percorrerContrato, type ApiInvocavel, type Resposta } from '@shared/ipc'
import { registrarLog } from './log'

/** Para cada função da API, um handler com os mesmos parâmetros, precedidos do evento. */
export type HandlersDe<T> = {
  [K in keyof T]: T[K] extends (...args: infer A) => Promise<infer R>
    ? (evento: IpcMainInvokeEvent, ...args: A) => R | Promise<R>
    : HandlersDe<T[K]>
}

// Mensagens escritas pelo app (validação, "Livro não encontrado") são lançadas como `Error`
// simples e vão para a tela. Qualquer outro tipo (TypeError, erro do SQLite) é defeito:
// a tela recebe um texto genérico e o detalhe fica no log.
export function mensagemParaTela(erro: unknown): string {
  if (erro instanceof Error && erro.constructor === Error && erro.message) return erro.message
  return 'Não foi possível concluir esta ação. O erro foi registrado no log da biblioteca.'
}

export function registrarIpc(handlers: HandlersDe<ApiInvocavel>): void {
  let filaEscrita: Promise<unknown> = Promise.resolve()
  percorrerContrato(CONTRATO, (caminho, [canal, tipo]) => {
    const handler = caminho.reduce<unknown>((h, nome) => (h as Record<string, unknown>)[nome], handlers) as (
      evento: IpcMainInvokeEvent,
      ...args: unknown[]
    ) => unknown
    const executar = async (evento: IpcMainInvokeEvent, args: unknown[]): Promise<Resposta<unknown>> => {
      try {
        return { ok: true, dados: await handler(evento, ...args) }
      } catch (erro) {
        registrarLog('erro', `Falha em ${canal}`, erro)
        return { ok: false, erro: mensagemParaTela(erro) }
      }
    }
    ipcMain.handle(canal, (evento, ...args) => {
      if (tipo === 'leitura') return executar(evento, args)
      // Escritas assíncronas (imagens, importação, restauração) terminam antes da próxima começar.
      const pedido = filaEscrita.then(() => executar(evento, args))
      filaEscrita = pedido
      return pedido
    })
  })
}
