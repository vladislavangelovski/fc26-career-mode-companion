import { readFile } from 'node:fs/promises'
import { watch, type FSWatcher } from 'node:fs'
import path from 'node:path'
import type { BrowserWindow } from 'electron'
import { n, parseCSV } from '../src/shared/csv'
import { careerProfileId, formationName, groupBy, mergeFixtures, mergeTelemetry, positionName as position, rowsForCareer, tacticRoleFocus } from '../src/shared/telemetry'
import type { OpponentPlayer, OpponentPlayerStatistics, Player, SourceName, SourceStatus, Tactic, TacticSlot } from '../src/shared/types'
import { CareerStore } from './store'

export class Importer {
  private watchers: FSWatcher[] = []
  private timer?: NodeJS.Timeout
  constructor(private store: CareerStore, private window: () => BrowserWindow | null) {}

  start() {
    this.stop()
    const files = [...Object.values(this.store.state.settings), ...['fc26_fixtures_snapshot.csv','fc26_opponent_snapshot.csv'].map(name=>path.join(path.dirname(this.store.state.settings.squadPath), name))]
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
    const missing: string[] = []
    const sources: { kind: string; rows: Record<string, string>[] }[] = []
    const coverage: Partial<Record<SourceName, SourceStatus>> = {}
    const sourceName = (kind:string) => kind.replace('Path','') as SourceName
    const configured = [...Object.entries(this.store.state.settings),
      ['fixturesPath',path.join(path.dirname(this.store.state.settings.squadPath), 'fc26_fixtures_snapshot.csv')],
      ['opponentPath',path.join(path.dirname(this.store.state.settings.squadPath), 'fc26_opponent_snapshot.csv')],
    ]
    for (const [kind, file] of configured) {
      try {
        const rows=parseCSV(await readFile(file, 'utf8'))
        sources.push({ kind, rows })
        coverage[sourceName(kind)]={status:'ready',rows:rows.length,capturedAt:rows.at(-1)?.captured_at || rows.at(-1)?.career_date}
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code === 'ENOENT') { missing.push(path.basename(file));coverage[sourceName(kind)]={status:'missing',rows:0,message:'Waiting for Live Editor export'} }
        else { const message=String(error);errors.push(`${path.basename(file)}: ${message}`);coverage[sourceName(kind)]={status:'error',rows:0,message} }
      }
    }
    const identityRow = sources.find(source => source.kind === 'squadPath')?.rows[0] ?? sources.find(source => source.kind === 'tacticsPath')?.rows[0] ?? sources.find(source => source.kind === 'telemetryPath')?.rows.at(-1)
    const profileId = careerProfileId(identityRow)
    if (profileId) await this.store.activate(profileId, identityRow?.team_id)
    for (const source of sources) {
      const rows = profileId ? rowsForCareer(source.rows, profileId) : source.rows
      if (source.kind === 'telemetryPath') this.importTelemetry(rows)
      if (source.kind === 'squadPath') this.importSquad(rows)
      if (source.kind === 'tacticsPath') this.importTactics(rows)
      if (source.kind === 'fixturesPath') mergeFixtures(this.store.state, rows)
      if (source.kind === 'opponentPath') this.importOpponent(rows)
    }
    this.store.state.sync = { status: errors.length ? 'error' : 'watching', lastImport: new Date().toISOString(), message: errors.join('\n') || (missing.length ? `Waiting for ${missing.join(', ')}` : 'Live Editor exports imported'), sources:coverage }
    await this.store.save(); this.emit()
    return this.store.state
  }

  private importTelemetry(rows: Record<string, string>[]) {
    mergeTelemetry(this.store.state, rows)
  }

  private importSquad(rows: Record<string, string>[]) {
    const fixed = new Set(['schema_version','career_id','captured_at','career_date','team_id','team','player_id','player','age','jersey_number','position','preferred_position_1','preferred_position_2','preferred_position_3','preferred_position_4','preferred_position_5','preferred_position_6','preferred_position_7','overall','potential','injury','suspension','form','morale','fitness','sharpness','contract_end','contract_months','wage','squad_role','playstyle_trait_1','playstyle_trait_2','role_1','role_2','role_3','role_4','role_5'])
    for (const row of rows) {
      const id = row.player_id
      if (!id) continue
      const current = this.store.state.players.find(p => p.id === id)
      const attributes = Object.fromEntries(Object.entries(row).filter(([key, value]) => !fixed.has(key) && value !== '').map(([key, value]) => [key, n(value)]))
      const preferred = Array.from({ length: 7 }, (_, i) => row[`preferred_position_${i + 1}`]).map(position).filter(Boolean).filter((v, i, a) => a.indexOf(v) === i)
      const lineupPosition = position(row.position)
      const positions = preferred.length ? preferred : lineupPosition ? [lineupPosition] : []
      const exposed = (value:string) => value === '' || n(value) <= 5 ? undefined : n(value)
      const snapshot = { capturedAt: row.captured_at || new Date().toISOString(), careerDate: row.career_date, overall: n(row.overall), potential: row.potential === '' ? undefined : n(row.potential), form: exposed(row.form), morale: exposed(row.morale), fitness: exposed(row.fitness), sharpness: exposed(row.sharpness) }
      const player: Player = { id, name: row.player, age: n(row.age), number: n(row.jersey_number), lineupPosition: row.position, positions, overall: n(row.overall), potential: snapshot.potential, attributes, familiarity: current?.familiarity ?? {}, injured: n(row.injury) > 0, suspended: n(row.suspension) > 0, form: snapshot.form, morale: snapshot.morale, fitness: snapshot.fitness, sharpness: snapshot.sharpness, contractEnd: row.contract_end || undefined, contractMonths:n(row.contract_months)||undefined, wage: n(row.wage), snapshots: current?.snapshots ?? [] }
      if (!player.snapshots.some(item => item.capturedAt === snapshot.capturedAt)) player.snapshots.push(snapshot)
      if (current) Object.assign(current, player); else this.store.state.players.push(player)
      this.store.state.career = { ...this.store.state.career, profileId: careerProfileId(row) || this.store.state.career.profileId, teamId: row.team_id, teamName: row.team || this.store.state.career.teamName }
    }
  }

  private importTactics(rows: Record<string, string>[]) {
    if (!rows.length) return
    const grouped = groupBy(rows, row => row.formation_id || 'active')
    for (const [id, tacticRows] of grouped) {
      const existing = this.store.state.tactics.find(t => t.id === id)
      const normalized = tacticRows.every(row => Math.abs(n(row.x, 2)) <= 1 && Math.abs(n(row.y, 2)) <= 1)
      const slots: TacticSlot[] = tacticRows.map((row, index) => {
        const decoded = tacticRoleFocus(row.role)
        return { id: `${id}:${row.slot || index}`, position: position(row.position) || `Slot ${index + 1}`, x: normalized ? n(row.x, .5) * 100 : n(row.x, 50), y: normalized ? (1 - n(row.y, .5)) * 100 : n(row.y, 50), role: decoded?.[0] ?? (row.role ? `FC role ${row.role}` : 'Unassigned'), focus: row.focus || decoded?.[1] || 'Unassigned', playerId: row.assigned_player_id || this.store.state.players.find(player => player.lineupPosition === row.position)?.id, imported: true }
      })
      const importedName = formationName(tacticRows.map(row => row.position)) || tacticRows[0].formation_name || 'Imported formation'
      const tactic: Tactic = { id, name: importedName, formation: importedName, slots, instructions: {}, corrected: existing?.corrected ?? false }
      if (existing?.corrected) tactic.slots = slots.map(slot => {
        const manual = existing.slots.find(saved => saved.id === slot.id && saved.position === slot.position)
        return manual ? { ...slot, role: manual.role, focus: manual.focus, playerId: manual.playerId } : slot
      })
      if (existing) Object.assign(existing, tactic); else this.store.state.tactics.push(tactic)
    }
  }

  private importOpponent(rows: Record<string,string>[]) {
    if (!rows.length) { this.store.state.opponent=undefined;return }
    const first=rows[0]
    const players=new Map<string,OpponentPlayer>()
    for (const row of rows) {
      if (!row.player_id) continue
      let player=players.get(row.player_id)
      if (!player) {
        const positions=Array.from({length:7},(_,index)=>position(row[`preferred_position_${index+1}`])).filter(Boolean).filter((value,index,array)=>array.indexOf(value)===index)
        player={id:row.player_id,name:row.player || `Player ${row.player_id}`,age:n(row.age)||undefined,number:n(row.jersey_number)||undefined,positions,lineupPosition:position(row.lineup_position)||undefined,injured:n(row.injury)>0,suspended:n(row.suspension)>0,statistics:[]}
        players.set(player.id,player)
      }
      if (row.stat_competition || n(row.appearances)>0) {
        const statistics:OpponentPlayerStatistics={competitionId:row.stat_competition_id||undefined,competition:row.stat_competition||'All competitions',appearances:n(row.appearances),averageRating:n(row.average_rating)||undefined,goals:n(row.goals),assists:n(row.assists),yellowCards:n(row.yellow_cards),redCards:n(row.red_cards),cleanSheets:n(row.clean_sheets),saves:n(row.saves),goalsConceded:n(row.goals_conceded)}
        player.statistics.push(statistics)
      }
    }
    this.store.state.opponent={capturedAt:first.captured_at||new Date().toISOString(),fixtureId:first.fixture_id||undefined,teamId:first.opponent_id,teamName:first.opponent,date:first.fixture_date||undefined,competitionId:first.competition_id||undefined,competition:first.competition||undefined,formation:first.formation_name||undefined,players:[...players.values()]}
  }

  emit() { const window=this.window();if(window?.isFocused())window.webContents.send('career:changed', this.store.state) }
}
