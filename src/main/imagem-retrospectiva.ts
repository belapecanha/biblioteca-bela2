import { BrowserWindow, dialog } from 'electron'
import sharp, { type OverlayOptions } from 'sharp'
import { COR_FUNDO } from '@shared/tema'
import { numero } from './validacao'

const LARGURA = 1080
const ALTURA = 1350

export async function salvarImagemRetrospectiva(
  ano: number,
  dono: BrowserWindow | null,
  preload: string,
  carregar: (janela: BrowserWindow, rota: string) => Promise<void>
): Promise<string | null> {
  if (numero(ano, 'Ano', 1, 9999) === null) throw new Error('Ano: número inválido.')
  const opcoes = { defaultPath: `retrospectiva-${ano}.png`, filters: [{ name: 'Imagem PNG', extensions: ['png'] }] }
  const escolha = dono ? await dialog.showSaveDialog(dono, opcoes) : await dialog.showSaveDialog(opcoes)
  if (escolha.canceled || !escolha.filePath) return null

  const janela = new BrowserWindow({
    show: false,
    width: LARGURA,
    height: ALTURA,
    useContentSize: true,
    backgroundColor: COR_FUNDO,
    webPreferences: { preload, contextIsolation: true, nodeIntegration: false, sandbox: true, offscreen: true }
  })
  try {
    await carregar(janela, `retrospectiva/imagem/${ano}?captura=1`)
    const limite = Date.now() + 20000
    while (!(await janela.webContents.executeJavaScript('document.documentElement.dataset.imagemPronta === "1"'))) {
      if (Date.now() > limite) throw new Error('A imagem demorou demais para ficar pronta.')
      await new Promise((ok) => setTimeout(ok, 100))
    }
    // O Windows limita a janela ao tamanho da tela, mesmo oculta, então a imagem é fotografada em faixas.
    const area = (await janela.webContents.executeJavaScript(
      `document.documentElement.style.overflow = 'hidden'; document.body.style.overflow = 'hidden'; ({ largura: innerWidth, altura: innerHeight })`
    )) as { largura: number; altura: number }
    const faixas: OverlayOptions[] = []
    for (let y = 0; y < ALTURA; y += area.altura) {
      for (let x = 0; x < LARGURA; x += area.largura) {
        await janela.webContents.executeJavaScript(
          `document.querySelector('.retro-imagem').style.transform = 'translate(${-x}px, ${-y}px)'`
        )
        await new Promise((ok) => setTimeout(ok, 200))
        const width = Math.min(area.largura, LARGURA - x)
        const height = Math.min(area.altura, ALTURA - y)
        const faixa = await janela.webContents.capturePage({ x: 0, y: 0, width, height })
        faixas.push({
          input: await sharp(faixa.toPNG()).resize(width, height, { fit: 'fill' }).toBuffer(),
          left: x,
          top: y
        })
      }
    }
    await sharp({ create: { width: LARGURA, height: ALTURA, channels: 3, background: COR_FUNDO } })
      .composite(faixas)
      .png()
      .toFile(escolha.filePath)
    return escolha.filePath
  } finally {
    janela.destroy()
  }
}
