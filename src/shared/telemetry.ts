import { n } from './csv'
import type { AnalystState, Appearance } from './types'

const POSITION_NAMES: Record<string, string> = { '0':'GK','1':'SW','2':'RWB','3':'RB','4':'RCB','5':'CB','6':'LCB','7':'LB','8':'LWB','9':'RDM','10':'CDM','11':'LDM','12':'RM','13':'RCM','14':'CM','15':'LCM','16':'LM','17':'RAM','18':'CAM','19':'LAM','20':'RF','21':'CF','22':'LF','23':'RW','24':'RS','25':'ST','26':'LS','27':'LW' }
export const positionName = (value?: string) => POSITION_NAMES[value ?? ''] ?? value ?? ''

export function groupBy<T>(items: T[], key: (item: T) => string) {
  const result = new Map<string, T[]>()
  for (const item of items) { const id = key(item); const group = result.get(id) ?? []; group.push(item); result.set(id, group) }
  return result
}

export function mergeTelemetry(state: AnalystState, rows: Record<string, string>[]) {
  for (const [id, matchRows] of groupBy(rows, row => row.match_id)) {
    if (!id) continue
    let match = state.matches.find(item => item.id === id)
    const first = matchRows[0]
    if (!match) {
      match = { id, fixtureId: first.fixture_id || undefined, date: first.career_date, competition: first.competition, opponent: first.opponent || 'Opponent not exposed', venue: first.home_away ? (first.home_away === 'home' ? 'home' : 'away') : undefined, teamScore: first.team_score === undefined ? undefined : n(first.team_score), opponentScore: first.opponent_score === undefined ? undefined : n(first.opponent_score), captureLevel: 'telemetry', appearances: [], teamStatistics: {}, screenshots: [], ocr: { status: 'none', values: [] } }
      state.matches.push(match)
    }
    for (const row of matchRows) {
      const playerId = row.player_id
      if (!state.players.some(p => p.id === playerId)) state.players.push({ id: playerId, name: row.player || `Player ${playerId}`, positions: [positionName(row.played_position)].filter(Boolean), overall: n(row.current_ovr), attributes: {}, familiarity: {}, injured: false, suspended: false, snapshots: [] })
      const appearance: Appearance = { id: `${id}:${playerId}`, matchId: id, playerId, minutes: n(row.minutes, 90), position: positionName(row.played_position), lineupStatus: row.lineup_status, lineupStatusSource: row.lineup_status_source, overall: n(row.current_ovr) || undefined, rating: n(row.rating) || undefined, goals: n(row.goals), assists: n(row.assists), yellowCards: n(row.yellow_cards), redCards: n(row.red_cards) + n(row.second_yellows), saves: n(row.saves), goalsConceded: n(row.goals_conceded), detailedMetrics: {} }
      const existing = match.appearances.findIndex(a => a.id === appearance.id)
      if (existing >= 0) match.appearances[existing] = { ...match.appearances[existing], ...appearance, detailedMetrics: match.appearances[existing].detailedMetrics }
      else match.appearances.push(appearance)
    }
    if (first.team_score === undefined) match.teamScore = match.appearances.reduce((total, appearance) => total + appearance.goals, 0)
    if (first.opponent_score === undefined) match.opponentScore = Math.max(...match.appearances.map(appearance => appearance.goalsConceded), 0)
  }
  state.matches.sort((a, b) => b.date.localeCompare(a.date))
  return state
}
