import { describe, expect, it } from 'vitest'
import type { AnalystState, Match } from './types'
import { filteredMatches, matchSeries, migrateState, seasonId, teamMetric } from './trends'
import { initialTestState } from './test-utils'

const fixture = (id: string, date: string, competition = 'League'): Match => ({ id, seasonId: seasonId(date), date, competition, opponent: id, teamScore: 1, opponentScore: 0, appearances: [] })

describe('trend history', () => {
  it('migrates legacy history to v4 and removes OCR data', () => {
    const raw = initialTestState() as AnalystState
    raw.schemaVersion = 3
    raw.matches = [{ ...fixture('old','2025-08-10'), seasonId: undefined, captureLevel:'played',teamStatistics:{expectedGoals:1.2},opponentStatistics:{},screenshots:[{id:'s1'}],ocr:{status:'confirmed',values:[]} } as unknown as Match]
    delete (raw as Partial<AnalystState>).tactics
    delete (raw as Partial<AnalystState>).sync
    raw.players = [{ id:'p1',name:'Player',positions:['ST'],overall:71,potential:80,attributes:{},familiarity:{},injured:false,suspended:false,snapshots:[{capturedAt:'2025-08-10T10:00:00Z',overall:70}] }]
    const migrated=migrateState(raw)
    expect(migrated.schemaVersion).toBe(4)
    expect(migrated.matches[0]).not.toHaveProperty('ocr')
    expect(migrated.matches[0]).not.toHaveProperty('screenshots')
    expect(migrated.matches[0].seasonId).toBe('2025/26')
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

  it('builds automatic scoring trends', () => {
    const match=fixture('one','2025-08-01');match.teamScore=3;match.opponentScore=1
    expect(matchSeries([match],'gd','Goal difference',item=>teamMetric(item,'goalDifference'),'Telemetry').points[0].value).toBe(2)
  })
})
