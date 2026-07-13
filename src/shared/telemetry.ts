import { n } from './csv'
import type { AnalystState, Appearance } from './types'

const POSITION_NAMES: Record<string, string> = { '0':'GK','1':'GK','2':'RB','3':'RB','4':'CB','5':'CB','6':'CB','7':'LB','8':'LB','9':'CDM','10':'CDM','11':'CDM','12':'RM','13':'CM','14':'CM','15':'CM','16':'LM','17':'CAM','18':'CAM','19':'CAM','20':'RW','21':'ST','22':'LW','23':'RW','24':'ST','25':'ST','26':'ST','27':'LW' }
export const positionName = (value?: string) => POSITION_NAMES[value ?? ''] ?? value ?? ''

const TACTIC_ROLE_FOCUS: Record<string, [string, string]> = {
  '4162':['Goalkeeper','Balanced'], '8386':['Fullback','Balanced'],
  '12737':['Defender','Defend'], '12865':['Ball-Playing Defender','Defend'],
  '17095':['Holding','Ball-Winning'], '25605':['Winger','Attack'],
  '25731':['Wide Midfielder','Build-Up'], '30346':['Classic 10','Versatile'],
  '38213':['Target Forward','Attack'], '38275':['False 9','Build-Up'],
}
export const tacticRoleFocus = (value?: string) => TACTIC_ROLE_FOCUS[value ?? '']

export function formationName(positions: string[]) {
  const codes = positions.map(Number)
  const counts = [
    codes.filter(value => value >= 1 && value <= 8).length,
    codes.filter(value => value >= 9 && value <= 11).length,
    codes.filter(value => value >= 12 && value <= 16).length,
    codes.filter(value => value >= 17 && value <= 19).length,
    codes.filter(value => value >= 20 && value <= 27).length,
  ].filter(Boolean)
  if (counts.reduce((sum, value) => sum + value, 0) !== 10) return ''
  const name = counts.join('-')
  return name === '4-1-2-1-2' && codes.includes(12) && codes.includes(16) ? `${name} Wide` : name
}

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
