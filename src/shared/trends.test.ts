import { describe, expect, it } from 'vitest'
import type { AnalystState, Match } from './types'
import { filteredMatches, matchSeries, migrateState, seasonId, teamMetric } from './trends'
import { initialTestState } from './test-utils'

const fixture = (id: string, date: string, competition = 'League'): Match => ({ id, seasonId: seasonId(date), date, competition, opponent: id, teamScore: 1, opponentScore: 0, captureLevel: 'telemetry', appearances: [], teamStatistics: {}, screenshots: [], ocr: { status: 'none', values: [] } })

describe('trend history', () => {
  it('migrates v1 history to v2 without deleting it', () => {
    const raw = initialTestState() as AnalystState
    raw.schemaVersion = 1
    raw.matches = [{ ...fixture('old','2025-08-10'), seasonId: undefined } as unknown as Match]
    delete (raw.matches[0] as Partial<Match>).screenshots
    delete (raw as Partial<AnalystState>).tactics
    delete (raw as Partial<AnalystState>).sync
    raw.players = [{ id:'p1',name:'Player',positions:['ST'],overall:71,potential:80,attributes:{},familiarity:{},injured:false,suspended:false,snapshots:[{capturedAt:'2025-08-10T10:00:00Z',overall:70}] }]
    const migrated=migrateState(raw)
    expect(migrated.schemaVersion).toBe(2)
    expect(migrated.matches).toHaveLength(1)
    expect(migrated.matches[0].seasonId).toBe('2025/26')
    expect(migrated.matches[0].screenshots).toEqual([])
    expect(migrated.tactics).toEqual([])
    expect(migrated.players[0].snapshots[0]).toMatchObject({potential:80,careerDate:'2025-08-10'})
  })

  it('uses a July-June season, chronological ranges and competition filters', () => {
    expect(seasonId('2026-06-30')).toBe('2025/26')
    expect(seasonId('2026-07-01')).toBe('2026/27')
    const state=initialTestState();state.matches=[fixture('b','2025-09-02'),fixture('a','2025-08-01'),fixture('cup','2025-10-01','Cup'),fixture('previous','2025-05-01')]
    expect(filteredMatches(state,5).map(match=>match.id)).toEqual(['a','b','cup'])
    expect(filteredMatches(state,'all','League').map(match=>match.id)).toEqual(['a','b'])
  })

  it('keeps unconfirmed detailed values as chart gaps', () => {
    const unconfirmed=fixture('one','2025-08-01');unconfirmed.teamStatistics.expectedGoals=1.8
    const confirmed=fixture('two','2025-08-08');confirmed.teamStatistics.expectedGoals=2.1;confirmed.ocr.status='confirmed'
    expect(matchSeries([unconfirmed,confirmed],'xg','xG',match=>teamMetric(match,'expectedGoals'),'Confirmed OCR').points.map(point=>point.value)).toEqual([undefined,2.1])
    confirmed.teamStatistics.expectedGoalsAgainst=1.4
    expect(teamMetric(confirmed,'expectedGoalDifference')).toBe(.7)
  })
})
