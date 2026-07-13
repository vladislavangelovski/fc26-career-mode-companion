import type { MatchScreenshot, OCRValue } from './types'

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
    for (const [label, field] of Object.entries(aliases)) {
      const match = line.match(new RegExp(`${label.replace(' ', '\\s+')}[^0-9-]*(-?\\d+(?:[.,]\\d+)?)%?`, 'i'))
      if (match) results.push({ id: `${screenshotId}:${results.length}`, screenshotId, playerId, scope, unmatchedPlayer: scope === 'player' && !playerId, field, value: Number(match[1].replace(',', '.')), confidence: Math.round(confidence), included: scope !== 'player' || Boolean(playerId) })
    }
  }
  return results
}
