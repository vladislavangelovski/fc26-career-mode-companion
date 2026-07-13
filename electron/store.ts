import { app } from 'electron'
import { createHash } from 'node:crypto'
import { copyFile, mkdir, readFile, rename, stat, unlink, writeFile } from 'node:fs/promises'
import path from 'node:path'
import os from 'node:os'
import type { AnalystState } from '../src/shared/types'
import { migrateState } from '../src/shared/trends'

const VERSION = 3
const desktop = path.join(os.homedir(), 'Desktop')
const directory = path.join(app.getPath('appData'), 'FC26 Career Analyst')
const liveEditorDirectory = path.join(directory, 'Live Editor')
const exportNames = {
  telemetryPath: 'fc26_match_telemetry.csv',
  squadPath: 'fc26_squad_snapshot.csv',
  tacticsPath: 'fc26_tactics_snapshot.csv',
} as const

export function initialState(settings?: AnalystState['settings'], profileId = 'unlinked'): AnalystState {
  return {
    schemaVersion: VERSION,
    career: { profileId, teamName: 'Unlinked career', season: 'Current season', createdAt: new Date().toISOString() },
    players: [], matches: [], tactics: [],
    settings: settings ?? Object.fromEntries(Object.entries(exportNames).map(([key, name]) => [key, path.join(liveEditorDirectory, name)])) as AnalystState['settings'],
    sync: { status: 'watching', message: 'Waiting for Live Editor exports' },
  }
}

export class CareerStore {
  readonly directory = directory
  readonly liveEditorDirectory = liveEditorDirectory
  private readonly profilesDirectory = path.join(this.directory, 'careers')
  private readonly activeFile = path.join(this.profilesDirectory, 'active.txt')
  private readonly legacyFile = path.join(this.directory, 'career.json')
  private readonly legacyBackupFile = path.join(this.directory, 'career.backup.json')
  private profileId = 'unlinked'
  state = initialState()

  private get profileDirectory() { return path.join(this.profilesDirectory, createHash('sha256').update(this.profileId).digest('hex').slice(0, 16)) }
  private get file() { return path.join(this.profileDirectory, 'career.json') }
  private get backupFile() { return path.join(this.profileDirectory, 'career.backup.json') }
  get screenshotDirectory() { return path.join(this.profileDirectory, 'screenshots') }

  private async readProfile() {
    try { return migrateState(JSON.parse(await readFile(this.file, 'utf8')) as AnalystState) }
    catch { return migrateState(JSON.parse(await readFile(this.backupFile, 'utf8')) as AnalystState) }
  }

  async load() {
    await mkdir(this.profilesDirectory, { recursive: true })
    await mkdir(this.liveEditorDirectory, { recursive: true })
    try {
      this.profileId = (await readFile(this.activeFile, 'utf8')).trim()
      this.state = await this.readProfile()
    } catch {
      try {
        this.state = migrateState(JSON.parse(await readFile(this.legacyFile, 'utf8')) as AnalystState)
        this.profileId = this.state.career.profileId || (this.state.career.teamId ? `team-${this.state.career.teamId}` : 'unlinked')
      } catch {
        try { this.state = migrateState(JSON.parse(await readFile(this.legacyBackupFile, 'utf8')) as AnalystState) } catch { this.state = initialState() }
        this.profileId = this.state.career.profileId || (this.state.career.teamId ? `team-${this.state.career.teamId}` : 'unlinked')
      }
    }
    this.state.settings = { ...initialState().settings, ...this.state.settings }
    this.state.career.profileId = this.profileId
    this.state.tactics = this.state.tactics.filter(tactic => tactic.id !== 'default' || tactic.slots.some(slot => slot.imported))
    for (const [key, name] of Object.entries(exportNames) as [keyof AnalystState['settings'], string][]) {
      const oldPath = path.join(desktop, name)
      if (this.state.settings[key].toLowerCase() !== oldPath.toLowerCase()) continue
      const newPath = path.join(this.liveEditorDirectory, name)
      try { await rename(oldPath, newPath) } catch { /* missing or already migrated */ }
      this.state.settings[key] = newPath
    }
    await writeFile(this.activeFile, this.profileId, 'utf8')
    await this.save()
    return this.state
  }

  async activate(profileId: string, teamId?: string) {
    if (!profileId || profileId === this.profileId) return this.state
    if (teamId && this.profileId === `team-${teamId}`) {
      await this.save()
      this.profileId = profileId
      this.state.career.profileId = profileId
      await writeFile(this.activeFile, profileId, 'utf8')
      await this.save()
      return this.state
    }
    const settings = this.state.settings
    await this.save()
    this.profileId = profileId
    try { this.state = await this.readProfile() } catch { this.state = initialState(settings, profileId) }
    this.state.career.profileId = profileId
    await writeFile(this.activeFile, profileId, 'utf8')
    await this.save()
    return this.state
  }

  async save() {
    this.profileId = this.state.career.profileId || this.profileId
    this.state.career.profileId = this.profileId
    await mkdir(this.profileDirectory, { recursive: true })
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
    if (![1, 2, VERSION].includes(restored.schemaVersion) || !Array.isArray(restored.players) || !Array.isArray(restored.matches)) throw new Error('Unsupported or invalid career backup')
    await this.save()
    restored.settings = { ...this.state.settings, ...restored.settings }
    this.state = migrateState(restored)
    this.profileId = this.state.career.profileId || (this.state.career.teamId ? `team-${this.state.career.teamId}` : `restored-${Date.now()}`)
    this.state.career.profileId = this.profileId
    await writeFile(this.activeFile, this.profileId, 'utf8')
    return this.save()
  }
}
