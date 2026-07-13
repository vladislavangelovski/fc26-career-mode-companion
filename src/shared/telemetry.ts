import { n } from './csv'
import type { AnalystState, Appearance } from './types'
import { seasonId } from './trends'

const POSITION_NAMES: Record<string, string> = { '0':'GK','1':'GK','2':'RB','3':'RB','4':'CB','5':'CB','6':'CB','7':'LB','8':'LB','9':'CDM','10':'CDM','11':'CDM','12':'RM','13':'CM','14':'CM','15':'CM','16':'LM','17':'CAM','18':'CAM','19':'CAM','20':'RW','21':'ST','22':'LW','23':'RW','24':'ST','25':'ST','26':'ST','27':'LW' }
export const positionName = (value?: string) => POSITION_NAMES[value ?? ''] ?? (/^-?\d+$/.test(value ?? '') ? '' : value ?? '')

const TACTIC_ROLE_FOCUS: Record<string, [string, string]> = {
  '4162':['Goalkeeper','Balanced'], '8386':['Fullback','Balanced'],
  '12737':['Defender','Defend'], '12865':['Ball-Playing Defender','Defend'],
  '17095':['Holding','Ball-Winning'], '25605':['Winger','Attack'],
  '25731':['Wide Midfielder','Build-Up'], '30346':['Classic 10','Versatile'],
  '38213':['Target Forward','Attack'], '38275':['False 9','Build-Up'],
}
export const tacticRoleFocus = (value?: string) => TACTIC_ROLE_FOCUS[value ?? '']
const ROLE_FOCUSES:Record<string,string[]> = {
  'GK:Goalkeeper':['Defend','Balanced'],'GK:Sweeper Keeper':['Balanced','Build-Up'],'GK:Ball-Playing Keeper':['Build-Up'],
  'FB:Fullback':['Defend','Balanced','Versatile'],'FB:Falseback':['Defend','Balanced'],'FB:Wingback':['Balanced','Support'],'FB:Attacking Wingback':['Support','Attack'],'FB:Inverted Wingback':['Build-Up','Attack'],
  'CB:Defender':['Defend','Balanced'],'CB:Stopper':['Balanced','Aggressive'],'CB:Ball-Playing Defender':['Defend','Build-Up','Aggressive'],'CB:Wide Back':['Defend','Aggressive','Support'],
  'CDM:Holding':['Defend','Roaming','Ball-Winning'],'CDM:Centre Half':['Defend'],'CDM:Deep-Lying Playmaker':['Defend','Roaming','Build-Up'],'CDM:Wide Half':['Defend','Build-Up'],'CDM:Box Crasher':['Balanced'],
  'CM:Box-to-Box':['Balanced','Ball-Winning'],'CM:Holding':['Defend','Ball-Winning'],'CM:Deep-Lying Playmaker':['Defend','Build-Up'],'CM:Playmaker':['Attack','Roaming'],'CM:Half-Winger':['Balanced','Attack','Support'],
  'WM:Winger':['Balanced','Attack'],'WM:Wide Midfielder':['Defend','Support','Build-Up'],'WM:Wide Playmaker':['Attack','Build-Up'],'WM:Inside Forward':['Balanced','Attack'],
  'CAM:Playmaker':['Balanced','Roaming','Build-Up'],'CAM:Shadow Striker':['Attack'],'CAM:Half-Winger':['Balanced','Attack','Roaming'],'CAM:Classic 10':['Attack','Wide','Versatile'],
  'WG:Winger':['Balanced','Attack','Versatile'],'WG:Inside Forward':['Balanced','Attack','Roaming'],'WG:Wide Playmaker':['Attack','Build-Up'],
  'ST:Advanced Forward':['Attack','Support','Versatile'],'ST:Poacher':['Attack','Support','Versatile'],'ST:False 9':['Build-Up','Attack'],'ST:Target Forward':['Balanced','Attack','Wide'],
}
export const roleFocuses = (position:string,role:string) => ROLE_FOCUSES[`${({LB:'FB',RB:'FB',LM:'WM',RM:'WM',LW:'WG',RW:'WG'} as Record<string,string>)[position]??position}:${role}`] ?? ['Balanced']
export const careerProfileId = (row?: Record<string, string>) => row?.career_id || (row?.team_id ? `team-${row.team_id}` : '')
export const rowsForCareer = (rows: Record<string, string>[], profileId: string) => rows.filter(row => !careerProfileId(row) || careerProfileId(row) === profileId)

export function mergeFixtures(state: AnalystState, rows: Record<string,string>[]) {
  for (const match of state.matches) {
    const fixture = rows.find(row => (match.fixtureId && row.fixture_id === match.fixtureId) || (row.career_date === match.date && (!match.competition || !row.competition || row.competition === match.competition)))
    if (!fixture?.opponent) continue
    match.fixtureId = fixture.fixture_id || match.fixtureId
    match.opponent = fixture.opponent
    match.venue = fixture.home_away === 'home' ? 'home' : fixture.home_away === 'away' ? 'away' : match.venue
    match.competition ||= fixture.competition
  }
  return state
}

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
      match = { id, seasonId: seasonId(first.career_date), fixtureId: first.fixture_id || undefined, date: first.career_date, competition: first.competition, opponent: first.opponent || 'Opponent not exposed', venue: first.home_away ? (first.home_away === 'home' ? 'home' : 'away') : undefined, teamScore: first.team_score === undefined ? undefined : n(first.team_score), opponentScore: first.opponent_score === undefined ? undefined : n(first.opponent_score), captureLevel: 'telemetry', appearances: [], teamStatistics: {}, screenshots: [], ocr: { status: 'none', values: [] } }
      state.matches.push(match)
    }
    match.seasonId ||= seasonId(match.date)
    for (const row of matchRows) {
      const playerId = row.player_id
      if (!state.players.some(p => p.id === playerId)) state.players.push({ id: playerId, name: row.player || `Player ${playerId}`, positions: [positionName(row.played_position)].filter(Boolean), overall: n(row.current_ovr), attributes: {}, familiarity: {}, injured: false, suspended: false, snapshots: [] })
      const telemetry = { rating: n(row.rating) || undefined, goals: n(row.goals), assists: n(row.assists), saves: n(row.saves) }
      const appearance: Appearance = { id: `${id}:${playerId}`, matchId: id, playerId, minutes: n(row.minutes, 90), position: positionName(row.played_position), lineupStatus: row.lineup_status, lineupStatusSource: row.lineup_status_source, overall: n(row.current_ovr) || undefined, ...telemetry, yellowCards: n(row.yellow_cards), redCards: n(row.red_cards) + n(row.second_yellows), goalsConceded: n(row.goals_conceded), detailedMetrics: {}, telemetry }
      const existing = match.appearances.findIndex(a => a.id === appearance.id)
      if (existing >= 0) { const previous = match.appearances[existing]; match.appearances[existing] = { ...previous, ...appearance, ...(match.ocr.status === 'confirmed' ? { rating: previous.rating, goals: previous.goals, assists: previous.assists, saves: previous.saves } : {}), detailedMetrics: previous.detailedMetrics } }
      else match.appearances.push(appearance)
    }
    if (first.team_score === undefined) match.teamScore = match.appearances.reduce((total, appearance) => total + appearance.goals, 0)
    if (first.opponent_score === undefined) match.opponentScore = Math.max(...match.appearances.map(appearance => appearance.goalsConceded), 0)
  }
  state.matches.sort((a, b) => b.date.localeCompare(a.date))
  return state
}
