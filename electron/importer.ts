import { readFile } from 'node:fs/promises'
import { watch, type FSWatcher } from 'node:fs'
import path from 'node:path'
import type { BrowserWindow } from 'electron'
import { n, parseCSV } from '../src/shared/csv'
import { groupBy, mergeTelemetry, positionName as position } from '../src/shared/telemetry'
import type { Player, Tactic, TacticSlot } from '../src/shared/types'
import { CareerStore } from './store'

export class Importer {
  private watchers: FSWatcher[] = []
  private timer?: NodeJS.Timeout
  constructor(private store: CareerStore, private window: () => BrowserWindow | null) {}

  start() {
    this.stop()
    const files = Object.values(this.store.state.settings)
    for (const directory of new Set(files.map(file => path.dirname(file)))) {
      try {
        this.watchers.push(watch(directory, (_event, file) => {
          if (file && files.some(expected => path.basename(expected).toLowerCase() === file.toString().toLowerCase())) {
            clearTimeout(this.timer); this.timer = setTimeout(() => void this.importAll(), 300)
          }
        }))
      } catch (error) { this.store.state.sync = { status: 'error', message: String(error) } }
    }
  }

  stop() { this.watchers.forEach(w => w.close()); this.watchers = [] }

  async importAll() {
    this.store.state.sync = { status: 'importing', message: 'Reading Live Editor exports…' }
    this.emit()
    const errors: string[] = []
    for (const [kind, file] of Object.entries(this.store.state.settings)) {
      try {
        const rows = parseCSV(await readFile(file, 'utf8'))
        if (kind === 'telemetryPath') this.importTelemetry(rows)
        if (kind === 'squadPath') this.importSquad(rows)
        if (kind === 'tacticsPath') this.importTactics(rows)
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'ENOENT') errors.push(`${path.basename(file)}: ${String(error)}`)
      }
    }
    this.store.state.sync = { status: errors.length ? 'error' : 'watching', lastImport: new Date().toISOString(), message: errors.join('\n') || 'Live Editor files are being watched' }
    await this.store.save(); this.emit()
    return this.store.state
  }

  private importTelemetry(rows: Record<string, string>[]) {
    mergeTelemetry(this.store.state, rows)
  }

  private importSquad(rows: Record<string, string>[]) {
    const fixed = new Set(['schema_version','captured_at','career_date','team_id','team','player_id','player','age','jersey_number','position','preferred_position_1','preferred_position_2','preferred_position_3','preferred_position_4','preferred_position_5','preferred_position_6','preferred_position_7','overall','potential','injury','suspension','form','morale','fitness','sharpness','contract_end','contract_months','wage','squad_role','playstyle_trait_1','playstyle_trait_2','role_1','role_2','role_3','role_4','role_5'])
    for (const row of rows) {
      const id = row.player_id
      if (!id) continue
      const current = this.store.state.players.find(p => p.id === id)
      const attributes = Object.fromEntries(Object.entries(row).filter(([key, value]) => !fixed.has(key) && value !== '').map(([key, value]) => [key, n(value)]))
      const positions = [row.position, ...Array.from({ length: 7 }, (_, i) => row[`preferred_position_${i + 1}`])].map(position).filter(Boolean).filter((v, i, a) => a.indexOf(v) === i)
      const snapshot = { capturedAt: row.captured_at, overall: n(row.overall), form: row.form === '' ? undefined : n(row.form), morale: row.morale === '' ? undefined : n(row.morale), fitness: row.fitness === '' ? undefined : n(row.fitness), sharpness: row.sharpness === '' ? undefined : n(row.sharpness) }
      const player: Player = { id, name: row.player, age: n(row.age), number: n(row.jersey_number), positions, overall: n(row.overall), potential: n(row.potential), attributes, familiarity: current?.familiarity ?? {}, injured: n(row.injury) > 0, suspended: n(row.suspension) > 0, form: snapshot.form, morale: snapshot.morale, fitness: snapshot.fitness, sharpness: snapshot.sharpness, contractEnd: row.contract_end || undefined, wage: n(row.wage), snapshots: current?.snapshots ?? [] }
      if (!player.snapshots.some(item => item.capturedAt === snapshot.capturedAt)) player.snapshots.push(snapshot)
      if (current) Object.assign(current, player); else this.store.state.players.push(player)
      this.store.state.career = { ...this.store.state.career, teamId: row.team_id, teamName: row.team || this.store.state.career.teamName }
    }
  }

  private importTactics(rows: Record<string, string>[]) {
    if (!rows.length) return
    const grouped = groupBy(rows, row => row.formation_id || 'active')
    for (const [id, tacticRows] of grouped) {
      const existing = this.store.state.tactics.find(t => t.id === id)
      const slots: TacticSlot[] = tacticRows.map((row, index) => ({ id: `${id}:${row.slot || index}`, position: position(row.position) || `Slot ${index + 1}`, x: n(row.x, 50), y: n(row.y, 50), role: row.role || 'Balanced', focus: row.focus || 'Balanced', playerId: row.assigned_player_id || undefined, imported: true }))
      const tactic: Tactic = { id, name: tacticRows[0].formation_name || 'Active tactic', formation: tacticRows[0].formation_name || 'Imported formation', slots, instructions: {}, corrected: existing?.corrected ?? false }
      if (existing?.corrected) tactic.slots = slots.map(slot => existing.slots.find(s => s.id === slot.id) ?? slot)
      if (existing) Object.assign(existing, tactic); else this.store.state.tactics.push(tactic)
    }
  }

  emit() { this.window()?.webContents.send('career:changed', this.store.state) }
}
