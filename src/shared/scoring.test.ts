import { describe, expect, it } from 'vitest'
import { assignUniqueXI, positionAdjustedScore, ROLE_LIBRARY, scorePlayer, squadNeeds } from './scoring'
import type { Player, TacticSlot } from './types'

const player = (id: string, injured = false): Player => ({ id, name:id, positions:['CM'], overall:75, attributes:{vision:80,shortpassing:82,longpassing:78,ballcontrol:80,composure:76,reactions:78}, familiarity:{playmaker:50}, injured, suspended:false, fitness:80,sharpness:70,morale:75,form:80,snapshots:[] })

describe('recommendation scoring', () => {
  it('excludes injured players and exposes missing performance evidence', () => {
    expect(scorePlayer(player('injured',true),ROLE_LIBRARY.at(-1)!,[]).excluded).toBe('Injured')
    const healthy=scorePlayer(player('healthy'),ROLE_LIBRARY.at(-1)!,[])
    expect(healthy.total).toBeGreaterThan(0)
    expect(healthy.missingEvidence).toContain('detailed match metrics')
    expect(healthy.confidence).toBe('Basic')
  })
  it('does not turn missing telemetry into a low score', () => {
    const sparse=player('sparse'); sparse.fitness=undefined; sparse.sharpness=undefined; sparse.morale=undefined; sparse.form=undefined; sparse.familiarity={}
    const score=scorePlayer(sparse,ROLE_LIBRARY.at(-1)!,[])
    expect(Math.abs(score.total-score.attributes)).toBeLessThan(.51)
    expect(score.missingEvidence).toContain('role familiarity')
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
})
