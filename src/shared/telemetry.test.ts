import { describe, expect, it } from 'vitest'
import { initialTestState } from './test-utils'
import { careerProfileId, formationName, mergeTelemetry, positionName, rowsForCareer, tacticRoleFocus } from './telemetry'

describe('telemetry merge', () => {
  it('recognizes the exported 4-1-2-1-2 wide shape', () => {
    expect(formationName(['0','3','4','6','7','10','12','16','18','24','26'])).toBe('4-1-2-1-2 Wide')
  })

  it('decodes FC 26 positions, roles, and focuses without generic fallbacks', () => {
    expect(['4','5','6'].map(positionName)).toEqual(['CB','CB','CB'])
    expect(tacticRoleFocus('12737')).toEqual(['Defender','Defend'])
    expect(tacticRoleFocus('12865')).toEqual(['Ball-Playing Defender','Defend'])
    expect(tacticRoleFocus('17095')).toEqual(['Holding','Ball-Winning'])
    expect(tacticRoleFocus('38275')).toEqual(['False 9','Build-Up'])
  })

  it('keeps rows from different careers isolated', () => {
    const rows=[{career_id:'career-a',team_id:'1'},{career_id:'career-b',team_id:'1'},{team_id:'2'}]
    expect(careerProfileId(rows[0])).toBe('career-a')
    expect(rowsForCareer(rows,'career-a')).toEqual([rows[0]])
    expect(rowsForCareer(rows,'team-2')).toEqual([rows[2]])
  })

  it('uses match_id + player_id idempotently and accepts delayed rows', () => {
    const state = initialTestState()
    const first = { match_id:'fixture-40',fixture_id:'40',career_date:'2025-07-29',competition:'Cup',opponent:'Málaga',home_away:'home',team_score:'2',opponent_score:'1',player_id:'7',player:'João Félix',minutes:'90',played_position:'18',rating:'7.7',goals:'1',assists:'0',yellow_cards:'0',red_cards:'0',second_yellows:'0',saves:'0',goals_conceded:'0',current_ovr:'84' }
    mergeTelemetry(state, [first]); mergeTelemetry(state, [first])
    expect(state.matches).toHaveLength(1)
    expect(state.matches[0].appearances).toHaveLength(1)
    state.matches[0].appearances[0].detailedMetrics.passAccuracy = 92
    mergeTelemetry(state, [{...first,player_id:'9',player:'O\'Brien',minutes:'24'}])
    expect(state.matches[0].appearances).toHaveLength(2)
    mergeTelemetry(state, [first])
    expect(state.matches[0].appearances[0].detailedMetrics.passAccuracy).toBe(92)
  })
})
