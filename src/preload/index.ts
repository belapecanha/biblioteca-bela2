import { contextBridge, ipcRenderer } from 'electron'
import type { ApiBela } from '@shared/api'

const api: ApiBela = {
  estado: () => ipcRenderer.invoke('app:estado')
}

contextBridge.exposeInMainWorld('bela', api)
