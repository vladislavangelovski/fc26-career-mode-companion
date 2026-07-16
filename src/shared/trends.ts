import type { AnalystState, Appearance, Match, PlayerSnapshot } from './types'

export type TrendRange = 5 | 10 | 'all'
export type TrendSource = 'Telemetry' | 'Squad snapshot'
export interface TrendPoint { id: string; date: string; label: string; value?: number; source: TrendSource; matchId?: string }
export interface TrendSeries { id: string; label: string; points: TrendPoint[] }

export const seasonId = (date: string) => {
  const [year, month] = date.slice(0, 10).split('-').map(Number)
  const start = month >= 7 ? year : year - 1
  return Number.isFinite(start) ? `${start}/${String(start + 1).slice(-2)}` : 'Unknown season'
}

export function migrateState(raw: AnalystState): AnalystState {
  const state = raw
  state.career ??= { teamName: 'Unlinked career', season: 'Current season', createdAt: new Date().toISOString() }
  const latestCareerDate = [...(state.matches ?? [])].map(match => match.date).filter(Boolean).sort().at(-1)
  state.schemaVersion = 4
  state.matches ??= []
  state.players ??= []
  state.tactics ??= []
  state.settings ??= {} as AnalystState['settings']
  state.sync ??= { status: 'watching', message: 'Waiting for Live Editor exports' }
  for (const match of state.matches) {
    match.seasonId ||= seasonId(match.date)
    if (match.opponent === 'Opponent not exposed') match.opponent = 'Opponent pending fixture sync'
    match.appearances ??= []
    const legacy = match as Match & { captureLevel?: unknown; teamStatistics?: unknown; opponentStatistics?: unknown; screenshots?: unknown; ocr?: unknown }
    delete legacy.captureLevel; delete legacy.teamStatistics; delete legacy.opponentStatistics; delete legacy.screenshots; delete legacy.ocr
    for (const appearance of match.appearances) {
      const legacyAppearance = appearance as Appearance & { detailedMetrics?: unknown; telemetry?: unknown }
      delete legacyAppearance.detailedMetrics; delete legacyAppearance.telemetry
    }
  }
  if (state.opponent) {
    state.opponent.players ??= []
    for (const player of state.opponent.players) player.statistics ??= []
  }
  for (const player of state.players) {
    if ((player.form ?? 0) <= 5) player.form = undefined
    if ((player.fitness ?? 0) <= 5) player.fitness = undefined
    if ((player.sharpness ?? 0) <= 5) player.sharpness = undefined
    if ((player.morale ?? 0) <= 5) player.morale = undefined
    for (const snapshot of player.snapshots ??= []) {
      snapshot.careerDate ||= latestCareerDate || snapshot.capturedAt.slice(0, 10)
      snapshot.potential ??= player.potential
      if ((snapshot.form ?? 0) <= 5) snapshot.form = undefined
      if ((snapshot.fitness ?? 0) <= 5) snapshot.fitness = undefined
      if ((snapshot.sharpness ?? 0) <= 5) snapshot.sharpness = undefined
      if ((snapshot.morale ?? 0) <= 5) snapshot.morale = undefined
    }
  }
  return state
}

export const currentSeason = (state: AnalystState) => [...state.matches].sort((a, b) => b.date.localeCompare(a.date))[0]?.seasonId
  ?? state.players.flatMap(player => player.snapshots).map(snapshot => seasonId(snapshot.careerDate || snapshot.capturedAt)).sort().at(-1)
  ?? 'Unknown season'

export function filteredMatches(state: AnalystState, range: TrendRange, competition = 'All') {
  const season = currentSeason(state)
  const matches = state.matches.filter(match => match.seasonId === season && (competition === 'All' || match.competition === competition)).sort((a, b) => a.date.localeCompare(b.date))
  return range === 'all' ? matches : matches.slice(-range)
}

export const teamMetric = (match: Match, field: string) => {
  if (field === 'goals') return match.teamScore
  if (field === 'goalsConceded') return match.opponentScore
  if (field === 'goalDifference' && match.teamScore !== undefined && match.opponentScore !== undefined) return match.teamScore - match.opponentScore
}

export const playerMetric = (_match: Match, appearance: Appearance, field: string) => {
  const automatic: Record<string, number | undefined> = { rating: appearance.rating, minutes: appearance.minutes || undefined, goals: appearance.goals, assists: appearance.assists, saves: appearance.saves, goalsConceded: appearance.goalsConceded }
  return automatic[field]
}

export function matchSeries(matches: Match[], id: string, label: string, value: (match: Match) => number | undefined, source: TrendSource): TrendSeries {
  return { id, label, points: matches.map(match => ({ id: `${id}:${match.id}`, matchId: match.id, date: match.date, label: match.opponent, value: value(match), source })) }
}

export function snapshotSeries(snapshots: PlayerSnapshot[], field: keyof PlayerSnapshot, label: string, range: TrendRange, season?: string): TrendSeries {
  const points = [...snapshots].filter(snapshot => !season || seasonId(snapshot.careerDate || snapshot.capturedAt) === season).sort((a, b) => (a.careerDate || a.capturedAt).localeCompare(b.careerDate || b.capturedAt)).map((snapshot, index) => ({ id: `${String(field)}:${snapshot.capturedAt}:${index}`, date: snapshot.careerDate || snapshot.capturedAt.slice(0, 10), label, value: typeof snapshot[field] === 'number' ? snapshot[field] as number : undefined, source: 'Squad snapshot' as const }))
  return { id: String(field), label, points: range === 'all' ? points : points.slice(-range) }
}
