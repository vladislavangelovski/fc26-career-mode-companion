import type { Match, MatchScreenshot, OCRValue } from './types'

export function classifyOCR(text: string): MatchScreenshot['screenType'] {
  const normalized = text.toLowerCase()
  if (/player performance|minutes played|expected goals|distance covered|dribbles/.test(normalized)) return 'player-detail'
  if (/possession|shots|passes|match facts|team performance/.test(normalized)) return 'team-summary'
  return 'unknown'
}

export function extractOCRValues(text: string, confidence: number, screenshotId: string, playerId?: string, scope: OCRValue['scope'] = playerId ? 'player' : 'team'): OCRValue[] {
  const aliases: Record<string, string> = { rating: 'rating', goals: 'goals', assists: 'assists', shots: 'shots', 'shots on target': 'shotsOnTarget', passes: 'passes', 'pass accuracy': 'passAccuracy', possession: 'possession', tackles: 'tacklesWon', interceptions: 'interceptions', saves: 'saves', 'distance covered': 'distanceCovered', 'expected goals': 'expectedGoals', crosses: 'crossesCompleted' }
  const results: OCRValue[] = []
  for (const line of text.split(/\r?\n/).map(value => value.trim()).filter(Boolean)) {
    for (const [label, field] of Object.entries(aliases).sort(([a], [b]) => b.length - a.length)) {
      const escaped = label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\s+/g, '\\s+')
      const match = line.match(new RegExp(`(?:^|\\s)${escaped}[^0-9-]*(-?\\d+(?:[.,]\\d+)?)%?`, 'i'))
      if (match) { results.push({ id: `${screenshotId}:${results.length}`, screenshotId, playerId, scope, unmatchedPlayer: scope === 'player' && !playerId, field, value: Number(match[1].replace(',', '.')), confidence: Math.round(confidence), included: scope !== 'player' || Boolean(playerId) }); break }
    }
  }
  return results
}

export function applyConfirmedOCR(match: Match, values: OCRValue[]) {
  match.ocr.values = values
  match.teamStatistics = {}
  for (const appearance of match.appearances) {
    appearance.detailedMetrics = {}
    const telemetry = appearance.telemetry ?? { rating: appearance.rating, goals: appearance.goals, assists: appearance.assists, saves: appearance.saves }
    appearance.telemetry = telemetry
    appearance.rating = telemetry.rating
    appearance.goals = telemetry.goals
    appearance.assists = telemetry.assists
    appearance.saves = telemetry.saves
  }
  for (const value of values.filter(item => item.included)) {
    const numeric = Number(value.value)
    if (!Number.isFinite(numeric) || (value.scope === 'player' && !value.playerId)) continue
    if (value.playerId) {
      const appearance = match.appearances.find(item => item.playerId === value.playerId)
      if (!appearance) continue
      if (value.field === 'rating') appearance.rating = numeric
      else if (value.field === 'goals') appearance.goals = numeric
      else if (value.field === 'assists') appearance.assists = numeric
      else if (value.field === 'saves') appearance.saves = numeric
      else appearance.detailedMetrics[value.field] = numeric
    } else match.teamStatistics[value.field] = numeric
  }
  match.ocr.status = 'confirmed'
}
