import { n } from './csv'
import type { AnalystState, Appearance } from './types'
import { seasonId } from './trends'

const POSITION_NAMES: Record<string, string> = { '0':'GK','1':'GK','2':'RB','3':'RB','4':'CB','5':'CB','6':'CB','7':'LB','8':'LB','9':'CDM','10':'CDM','11':'CDM','12':'RM','13':'CM','14':'CM','15':'CM','16':'LM','17':'CAM','18':'CAM','19':'CAM','20':'RW','21':'ST','22':'LW','23':'RW','24':'ST','25':'ST','26':'ST','27':'LW' }
export const positionName = (value?: string) => POSITION_NAMES[value ?? ''] ?? (/^-?\d+$/.test(value ?? '') ? '' : value ?? '')

const TACTIC_ROLES: Record<number, Record<number, string>> = {
  1:{1:'Goalkeeper',2:'Sweeper Keeper',27:'Ball-Playing Keeper'},
  2:{3:'Fullback',4:'Wingback',5:'Falseback',6:'Attacking Wingback',28:'Inverted Wingback'},
  3:{7:'Defender',8:'Stopper',9:'Ball-Playing Defender',29:'Wide Back'},
  4:{10:'Centre Half',11:'Holding',12:'Deep-Lying Playmaker',13:'Wide Half',30:'Box Crasher'},
  5:{11:'Holding',12:'Deep-Lying Playmaker',14:'Box-to-Box',15:'Half-Winger',20:'Playmaker'},
  6:{16:'Winger',17:'Wide Playmaker',18:'Wide Midfielder',19:'Inside Forward'},
  7:{15:'Half-Winger',20:'Playmaker',25:'Shadow Striker',26:'Classic 10'},
  8:{16:'Winger',17:'Wide Playmaker',19:'Inside Forward'},
  9:{21:'Target Forward',22:'False 9',23:'Poacher',24:'Advanced Forward'},
}
const TACTIC_FOCUSES: Record<number, string> = {1:'Defend',2:'Balanced',3:'Build-Up',4:'Support',5:'Attack',6:'Roaming',7:'Ball-Winning',8:'Aggressive',9:'Wide',10:'Versatile'}
export function tacticRoleFocus(value?: string): [string, string] | undefined {
  const code=Number(value)
  if (!Number.isInteger(code) || code < 0) return
  const role=TACTIC_ROLES[code >> 12]?.[(code >> 6) & 63]
  const focus=TACTIC_FOCUSES[code & 63]
  return role && focus ? [role,focus] : undefined
}
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
      match = { id, seasonId: seasonId(first.career_date), fixtureId: first.fixture_id || undefined, date: first.career_date, competition: first.competition, opponent: first.opponent || 'Opponent pending fixture sync', venue: first.home_away === 'home' ? 'home' : first.home_away === 'away' ? 'away' : undefined, tacticId:first.formation_id||undefined,formation:first.formation_name||undefined,teamScore: first.team_score === undefined || first.team_score === '' ? undefined : n(first.team_score), opponentScore: first.opponent_score === undefined || first.opponent_score === '' ? undefined : n(first.opponent_score), captureLevel: 'telemetry', appearances: [], teamStatistics: {}, opponentStatistics:{}, screenshots: [], ocr: { status: 'none', values: [] } }
      state.matches.push(match)
    }
    match.fixtureId = first.fixture_id || match.fixtureId
    match.competition = first.competition || match.competition
    match.opponent = first.opponent || match.opponent
    match.venue = first.home_away === 'home' ? 'home' : first.home_away === 'away' ? 'away' : match.venue
    match.tacticId=first.formation_id||match.tacticId
    match.formation=first.formation_name||match.formation
    if (first.team_score !== undefined && first.team_score !== '') match.teamScore = n(first.team_score)
    if (first.opponent_score !== undefined && first.opponent_score !== '') match.opponentScore = n(first.opponent_score)
    match.seasonId ||= seasonId(match.date)
    for (const row of matchRows) {
      const playerId = row.player_id
      if (!state.players.some(p => p.id === playerId)) state.players.push({ id: playerId, name: row.player || `Player ${playerId}`, positions: [positionName(row.played_position)].filter(Boolean), overall: n(row.current_ovr), attributes: {}, familiarity: {}, injured: false, suspended: false, snapshots: [] })
      const telemetry = { rating: n(row.rating) || undefined, goals: n(row.goals), assists: n(row.assists), saves: n(row.saves) }
      const planned=tacticRoleFocus(row.planned_role_code)
      const appearance: Appearance = { id: `${id}:${playerId}`, matchId: id, playerId, minutes: n(row.minutes), position: positionName(row.played_position), plannedRole:planned?.[0],plannedFocus:planned?.[1],lineupStatus: row.lineup_status, lineupStatusSource: row.lineup_status_source, overall: n(row.current_ovr) || undefined, ...telemetry, yellowCards: n(row.yellow_cards), redCards: n(row.red_cards) + n(row.second_yellows), goalsConceded: n(row.goals_conceded), detailedMetrics: {}, telemetry }
      const existing = match.appearances.findIndex(a => a.id === appearance.id)
      if (existing >= 0) { const previous = match.appearances[existing]; match.appearances[existing] = { ...previous, ...appearance, ...(match.ocr.status === 'confirmed' ? { rating: previous.rating, goals: previous.goals, assists: previous.assists, saves: previous.saves } : {}), detailedMetrics: previous.detailedMetrics } }
      else match.appearances.push(appearance)
    }
    if (first.team_score === undefined || first.team_score === '') match.teamScore = match.appearances.reduce((total, appearance) => total + appearance.goals, 0)
    if (first.opponent_score === undefined || first.opponent_score === '') match.opponentScore = Math.max(...match.appearances.map(appearance => appearance.goalsConceded), 0)
  }
  state.matches.sort((a, b) => b.date.localeCompare(a.date))
  return state
}
