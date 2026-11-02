import { contextBridge, ipcRenderer } from 'electron'
import type { ApiBela } from '@shared/api'

const api: ApiBela = {
  estado: () => ipcRenderer.invoke('app:estado'),
  livros: {
    listar: () => ipcRenderer.invoke('livros:listar'),
    obter: (id) => ipcRenderer.invoke('livros:obter', id),
    definirNota: (id, nota) => ipcRenderer.invoke('livros:nota', id, nota),
    definirStatus: (id, status) => ipcRenderer.invoke('livros:status', id, status),
    definirPosse: (ids, posse) => ipcRenderer.invoke('livros:posse', ids, posse),
    definirClassificacoes: (id, tipo, nomes) => ipcRenderer.invoke('livros:classificacoes', id, tipo, nomes),
    salvar: (dados, confirmar, capa) => ipcRenderer.invoke('livros:salvar', dados, confirmar, capa),
    duplicados: (dados) => ipcRenderer.invoke('livros:duplicados', dados),
    trocarCapa: (id, capa) => ipcRenderer.invoke('livros:capa', id, capa),
    salvarNotas: (id, texto) => ipcRenderer.invoke('livros:notas', id, texto),
    editoras: () => ipcRenderer.invoke('livros:editoras')
  },
  leituras: {
    salvar: (dados) => ipcRenderer.invoke('leituras:salvar', dados),
    progresso: (livroId, leituraId, data, pagina) => ipcRenderer.invoke('leituras:progresso', livroId, leituraId, data, pagina),
    removerProgresso: (livroId, id) => ipcRenderer.invoke('leituras:remover-progresso', livroId, id),
    salvarCitacao: (livroId, citacao) => ipcRenderer.invoke('leituras:citacao', livroId, citacao),
    removerCitacao: (livroId, id) => ipcRenderer.invoke('leituras:remover-citacao', livroId, id),
    diario: () => ipcRenderer.invoke('leituras:diario')
  },
  google: {
    configuracao: () => ipcRenderer.invoke('google:configuracao'),
    buscar: (termo) => ipcRenderer.invoke('google:buscar', termo)
  },
  analise: {
    base: () => ipcRenderer.invoke('analise:base'),
    definirMeta: (ano, livros) => ipcRenderer.invoke('analise:meta', ano, livros),
    salvarImagem: (ano) => ipcRenderer.invoke('analise:salvar-imagem', ano)
  }
}

contextBridge.exposeInMainWorld('bela', api)
