import { contextBridge, ipcRenderer } from 'electron'
import type { ApiBela } from '@shared/api'
import { CANAL_ERRO, CONTRATO, percorrerContrato, type Resposta } from '@shared/ipc'

// A API é montada a partir do contrato: nenhum nome de canal é escrito à mão aqui.
// O main sempre responde { ok, dados } ou { ok: false, erro }; o erro vira uma exceção
// com a mensagem já pronta para a tela.
async function chamar(canal: string, args: unknown[]): Promise<unknown> {
  const resposta = (await ipcRenderer.invoke(canal, ...args)) as Resposta<unknown>
  if (!resposta.ok) throw new Error(resposta.erro)
  return resposta.dados
}

const api: Record<string, unknown> = {
  registrarErro: (mensagem: string, detalhe?: string) =>
    ipcRenderer.send(
      CANAL_ERRO,
      String(mensagem).slice(0, 2000),
      detalhe === undefined ? undefined : String(detalhe).slice(0, 20000)
    )
}
percorrerContrato(CONTRATO, (caminho, [canal]) => {
  let grupo = api
  for (const nome of caminho.slice(0, -1)) grupo = (grupo[nome] ??= {}) as Record<string, unknown>
  grupo[caminho.at(-1)!] = (...args: unknown[]) => chamar(canal, args)
})

contextBridge.exposeInMainWorld('bela', api as unknown as ApiBela)
