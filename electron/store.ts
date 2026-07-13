import { app } from 'electron'
import { copyFile, mkdir, readFile, rename, stat, unlink, writeFile } from 'node:fs/promises'
import path from 'node:path'
import os from 'node:os'
import type { AnalystState } from '../src/shared/types'

const VERSION = 1
const desktop = path.join(os.homedir(), 'Desktop')

export function initialState(): AnalystState {
  return {
    schemaVersion: VERSION,
    career: { teamName: 'Unlinked career', season: 'Current season', createdAt: new Date().toISOString() },
    players: [], matches: [], tactics: [],
    settings: {
      telemetryPath: path.join(desktop, 'fc26_match_telemetry.csv'),
      squadPath: path.join(desktop, 'fc26_squad_snapshot.csv'),
      tacticsPath: path.join(desktop, 'fc26_tactics_snapshot.csv'),
    },
    sync: { status: 'watching', message: 'Waiting for Live Editor exports' },
  }
}

export class CareerStore {
  readonly directory = path.join(app.getPath('appData'), 'FC26 Career Analyst')
  readonly screenshotDirectory = path.join(this.directory, 'screenshots')
  private readonly file = path.join(this.directory, 'career.json')
  private readonly backupFile = path.join(this.directory, 'career.backup.json')
  state = initialState()

  async load() {
    await mkdir(this.screenshotDirectory, { recursive: true })
    try {
      this.state = JSON.parse(await readFile(this.file, 'utf8')) as AnalystState
    } catch {
      try {
        this.state = JSON.parse(await readFile(this.backupFile, 'utf8')) as AnalystState
        await this.save()
      } catch { await this.save() }
    }
    return this.state
  }

  async save() {
    await mkdir(this.directory, { recursive: true })
    const temp = `${this.file}.tmp`
    await writeFile(temp, JSON.stringify(this.state, null, 2), 'utf8')
    try { await stat(this.file); await copyFile(this.file, this.backupFile) } catch { /* first save */ }
    try { await unlink(this.file) } catch { /* first save */ }
    await rename(temp, this.file)
    return this.state
  }

  async exportTo(destination: string) { await this.save(); await copyFile(this.file, destination) }
  async restoreFrom(source: string) {
    const restored = JSON.parse(await readFile(source, 'utf8')) as AnalystState
    if (restored.schemaVersion !== VERSION || !Array.isArray(restored.players) || !Array.isArray(restored.matches)) throw new Error('Unsupported or invalid career backup')
    this.state = restored
    return this.save()
  }
}
