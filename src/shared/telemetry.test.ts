import { describe, expect, it } from 'vitest'
import { initialTestState } from './test-utils'
import { mergeTelemetry } from './telemetry'

describe('telemetry merge', () => {
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
