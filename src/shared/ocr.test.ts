import { describe, expect, it } from 'vitest'
import { applyConfirmedOCR, classifyOCR, extractExpectedGoalsPair, extractOCRValues } from './ocr'
import type { Match } from './types'

describe('OCR template parsing', () => {
  it('classifies known screens and extracts review values', () => {
    expect(classifyOCR('MATCH FACTS\nPossession 54%\nShots 12')).toBe('team-summary')
    expect(classifyOCR('PLAYER PERFORMANCE\nDistance covered 11.2')).toBe('player-detail')
    expect(classifyOCR('PLAYER PERFORMANCE\nShots 4')).toBe('player-detail')
    expect(extractOCRValues('Rating 7,8\nPass accuracy 92%',87,'shot-1','p1')).toMatchObject([
      {field:'rating',value:7.8,confidence:87,playerId:'p1'},
      {field:'passAccuracy',value:92,confidence:87,playerId:'p1'},
    ])
    expect(extractOCRValues('Rating 6.4',72,'shot-2',undefined,'player')[0]).toMatchObject({scope:'player',unmatchedPlayer:true,included:false})
    expect(extractOCRValues('Shots on target 5\nShots 12\nExpected goals 1.7',96,'shot-3').map(value=>value.field)).toEqual(['shotsOnTarget','shots','expectedGoals'])
  })

  it('rebuilds confirmed metrics so exclusions cannot leave stale values', () => {
    const match:Match={id:'m1',seasonId:'2025/26',date:'2025-08-01',competition:'League',opponent:'Test',captureLevel:'played',appearances:[{id:'a1',matchId:'m1',playerId:'p1',minutes:90,rating:7,goals:1,assists:0,yellowCards:0,redCards:0,saves:0,goalsConceded:0,detailedMetrics:{},telemetry:{rating:7,goals:1,assists:0,saves:0}}],teamScore:1,opponentScore:0,teamStatistics:{},screenshots:[],ocr:{status:'review',values:[]}}
    const values=[{id:'v1',screenshotId:'s1',scope:'team' as const,field:'expectedGoals',value:1.9,confidence:99,included:true},{id:'v2',screenshotId:'s1',scope:'player' as const,playerId:'p1',field:'rating',value:8.4,confidence:99,included:true}]
    applyConfirmedOCR(match,values)
    expect(match.teamStatistics.expectedGoals).toBe(1.9);expect(match.appearances[0].rating).toBe(8.4)
    applyConfirmedOCR(match,values.map(value=>({...value,included:false})))
    expect(match.teamStatistics.expectedGoals).toBeUndefined();expect(match.appearances[0].rating).toBe(7)
  })
  it('extracts managed-team xG and xGA from both sides of the summary row',()=>{
    expect(extractExpectedGoalsPair('1.8 Expected Goals 0.9',98,'home',true).map(value=>[value.field,value.value])).toEqual([['expectedGoals',1.8],['expectedGoalsAgainst',.9]])
    expect(extractExpectedGoalsPair('Expected Goals 1.8 0.9',98,'away',false).map(value=>[value.field,value.value])).toEqual([['expectedGoals',.9],['expectedGoalsAgainst',1.8]])
  })
})
