import { describe, expect, it } from 'vitest'
import { assignUniqueXI, playerDecision, positionAdjustedScore, ROLE_LIBRARY, scorePlayer, squadNeeds } from './scoring'
import type { Appearance, Player, TacticSlot } from './types'

const player = (id: string, injured = false): Player => ({ id, name:id, positions:['CM'], overall:75, attributes:{vision:80,shortpassing:82,longpassing:78,ballcontrol:80,composure:76,reactions:78}, familiarity:{playmaker:50}, injured, suspended:false, fitness:80,sharpness:70,morale:75,form:80,snapshots:[] })

describe('recommendation scoring', () => {
  it('excludes injured players and exposes missing performance evidence', () => {
    expect(scorePlayer(player('injured',true),ROLE_LIBRARY.at(-1)!,[]).excluded).toBe('Injured')
    const healthy=scorePlayer(player('healthy'),ROLE_LIBRARY.at(-1)!,[])
    expect(healthy.total).toBeGreaterThan(0)
    expect(healthy.missingEvidence).toContain('recent match ratings')
    expect(healthy.confidence).toBe('Basic')
  })
  it('does not turn missing telemetry into a low score', () => {
    const sparse=player('sparse'); sparse.fitness=undefined; sparse.sharpness=undefined; sparse.morale=undefined; sparse.form=3; sparse.familiarity={}
    const score=scorePlayer(sparse,ROLE_LIBRARY.at(-1)!,[])
    expect(Math.abs(score.total-score.attributes)).toBeLessThan(.51)
    expect(score.missingEvidence).toEqual(['recent match ratings'])
  })
  it('uses only the last five ratings for recent performance', () => {
    const appearances=[8,7,6,5,4,3].map((rating,index)=>({id:String(index),matchId:String(index),playerId:'rated',minutes:90,rating,goals:20,assists:20,yellowCards:0,redCards:0,saves:0,goalsConceded:0,detailedMetrics:{passAccuracy:100}})) as Appearance[]
    const score=scorePlayer(player('rated'),ROLE_LIBRARY.find(role=>role.id==='playmaker')!,appearances)
    expect(score.performance).toBe(50)
    expect(score.sampleSize).toBe(5)
  })
  it('finds the maximum unique assignment rather than a greedy lineup', () => {
    const slots=[{id:'one'},{id:'two'}] as TacticSlot[]
    const matrix:Record<string,number>={'A:one':100,'A:two':99,'B:one':98,'B:two':0}
    const result=assignUniqueXI([player('A'),player('B')],slots,(p,s)=>matrix[`${p.id}:${s.id}`])
    expect(result.reduce((sum,item)=>sum+item.score,0)).toBe(197)
    expect(result.find(item=>item.slotId==='one')?.playerId).toBe('B')
  })
  it('requires the exact position and prefers primary over secondary positions', () => {
    const left={...player('LB'),positions:['LB','LM']},right={...player('RB'),positions:['RB','LB']}
    expect(positionAdjustedScore(left,'RB',90)).toBe(Number.NEGATIVE_INFINITY)
    expect(positionAdjustedScore(right,'RB',80)).toBe(80)
    expect(positionAdjustedScore(right,'LB',80)).toBe(76)
    const xi=assignUniqueXI([left,right],[{id:'lb',position:'LB'},{id:'rb',position:'RB'}] as TacticSlot[],(candidate,slot)=>positionAdjustedScore(candidate,slot.position,candidate.id==='LB'?100:80))
    expect(xi.find(item=>item.slotId==='lb')?.playerId).toBe('LB')
    expect(xi.find(item=>item.slotId==='rb')?.playerId).toBe('RB')
  })
  it('flags thin natural-position depth even when starters score well', () => {
    const slots=[{id:'left',position:'CM'},{id:'right',position:'CM'}] as TacticSlot[]
    const needs=squadNeeds([player('A'),player('B')],slots)
    expect(needs).toHaveLength(1)
    expect(needs[0]).toMatchObject({code:'CM',depth:2,targetDepth:4})
    expect(squadNeeds([player('A'),player('B'),player('C'),player('D')],slots)).toHaveLength(0)
  })
  it('does not recommend another goalkeeper when the unit already has depth', () => {
    const keepers=Array.from({length:5},(_,index)=>({...player(String(index)),positions:['GK']}))
    expect(squadNeeds(keepers,[{id:'gk',position:'GK'} as TacticSlot])).toHaveLength(0)
  })
  it('requires evidence before bench or sale advice', () => {
    expect(playerDecision({starter:true,fitGap:0,performance:55,sample:1,alternativeGap:0,depthSafe:true})).toBeUndefined()
    expect(playerDecision({starter:true,fitGap:0,performance:55,sample:3,alternativeGap:0,depthSafe:true})).toBe('Consider bench')
    expect(playerDecision({starter:false,fitGap:-8,performance:55,sample:5,alternativeGap:0,depthSafe:true})).toBe('Review sale')
  })
  it('scores a normal goalkeeper as a goalkeeper, not a passer', () => {
    const role=ROLE_LIBRARY.find(item=>item.id==='gk')!
    expect(role.attributeWeights.gkdiving).toBeGreaterThan(0)
    expect(role.attributeWeights.shortpassing).toBeUndefined()
  })
})
