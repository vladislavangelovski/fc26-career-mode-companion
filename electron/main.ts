import { app, BrowserWindow, dialog, ipcMain } from 'electron'
import { access, copyFile } from 'node:fs/promises'
import path from 'node:path'
import { CareerStore } from './store'
import { Importer } from './importer'
import { confirmOCR, importScreenshots } from './ocr'
import type { AnalystState, OCRValue, Tactic } from '../src/shared/types'

let window: BrowserWindow | null = null
let store: CareerStore
let importer: Importer

async function deployLiveEditorScripts() {
  const target = 'C:\\FC 26 Live Editor\\lua\\autorun'
  try {
    await access(target)
    const source = app.isPackaged ? path.join(process.resourcesPath, 'live_editor') : path.join(app.getAppPath(), 'live_editor')
    await Promise.all(['career_snapshot.lua','match_telemetry.lua'].map(name=>copyFile(path.join(source,name),path.join(target,name))))
  } catch { /* Live Editor is optional or installed elsewhere; the app remains read-only. */ }
}

function createWindow() {
  window = new BrowserWindow({
    width: 1500, height: 920, minWidth: 1120, minHeight: 720, backgroundColor: '#0c0f0d',
    title: 'FC 26 Career Analyst',
    webPreferences: { preload: path.join(__dirname, 'preload.js'), contextIsolation: true, nodeIntegration: false, sandbox: true },
  })
  window.webContents.setZoomFactor(1.2)
  void window.loadFile(path.join(__dirname, '../../dist/index.html'))
  window.on('closed', () => { window = null })
}

function emit() { window?.webContents.send('career:changed', store.state) }

app.whenReady().then(async () => {
  await deployLiveEditorScripts()
  store = new CareerStore(); await store.load()
  importer = new Importer(store, () => window)
  createWindow(); importer.start(); await importer.importAll()

  ipcMain.handle('career:get', () => store.state)
  ipcMain.handle('career:settings', async (_event, settings: AnalystState['settings']) => { store.state.settings = settings; await store.save(); importer.start(); return importer.importAll() })
  ipcMain.handle('career:import', () => importer.importAll())
  ipcMain.handle('screenshots:import', async (_event, matchId: string) => {
    const chosen = await dialog.showOpenDialog(window!, { title: 'Add 2560×1440 FC 26 screenshots', properties: ['openFile', 'multiSelections'], filters: [{ name: 'Screenshots', extensions: ['png', 'jpg', 'jpeg', 'webp'] }] })
    if (chosen.canceled) return { imported: 0, duplicates: 0, rejected: [] }
    const result = await importScreenshots(store, matchId, chosen.filePaths, message => { store.state.sync = { status: 'importing', message }; emit() })
    store.state.sync = { status: 'watching', lastImport: new Date().toISOString(), message: 'OCR ready for review' }; emit(); return result
  })
  ipcMain.handle('ocr:confirm', async (_event, matchId: string, values: OCRValue[]) => { const state = await confirmOCR(store, matchId, values); emit(); return state })
  ipcMain.handle('tactic:update', async (_event, tactic: Tactic) => { tactic.corrected = true; const index = store.state.tactics.findIndex(item => item.id === tactic.id); if (index >= 0) store.state.tactics[index] = tactic; else store.state.tactics.push(tactic); await store.save(); emit(); return store.state })
  ipcMain.handle('career:backup', async () => { const result = await dialog.showSaveDialog(window!, { title: 'Export career backup', defaultPath: `fc26-career-${new Date().toISOString().slice(0, 10)}.json`, filters: [{ name: 'FC 26 Career', extensions: ['json'] }] }); if (result.canceled || !result.filePath) return null; await store.exportTo(result.filePath); return result.filePath })
  ipcMain.handle('career:restore', async () => { const result = await dialog.showOpenDialog(window!, { title: 'Restore career backup', properties: ['openFile'], filters: [{ name: 'FC 26 Career', extensions: ['json'] }] }); if (result.canceled) return null; const state = await store.restoreFrom(result.filePaths[0]); importer.start(); emit(); return state })
})

app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit() })
app.on('activate', () => { if (!window) createWindow() })
app.on('before-quit', () => importer?.stop())
