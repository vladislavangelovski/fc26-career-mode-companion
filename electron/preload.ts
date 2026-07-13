import { contextBridge, ipcRenderer } from 'electron'
import type { AnalystState, DesktopAPI, OCRValue, Tactic } from '../src/shared/types'

const api: DesktopAPI = {
  getState: () => ipcRenderer.invoke('career:get'),
  updateSettings: settings => ipcRenderer.invoke('career:settings', settings),
  importNow: () => ipcRenderer.invoke('career:import'),
  importScreenshots: matchId => ipcRenderer.invoke('screenshots:import', matchId),
  confirmOCR: (matchId: string, values: OCRValue[]) => ipcRenderer.invoke('ocr:confirm', matchId, values),
  updateTactic: (tactic: Tactic) => ipcRenderer.invoke('tactic:update', tactic),
  backup: () => ipcRenderer.invoke('career:backup'),
  restore: () => ipcRenderer.invoke('career:restore'),
  onStateChanged: callback => {
    const listener = (_event: Electron.IpcRendererEvent, state: AnalystState) => callback(state)
    ipcRenderer.on('career:changed', listener)
    return () => ipcRenderer.removeListener('career:changed', listener)
  },
}
contextBridge.exposeInMainWorld('fc26', api)
