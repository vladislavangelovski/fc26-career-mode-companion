import { describe, expect, it } from 'vitest'
import { assignUniqueXI, ROLE_LIBRARY, scorePlayer } from './scoring'
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
  it('finds the maximum unique assignment rather than a greedy lineup', () => {
    const slots=[{id:'one'},{id:'two'}] as TacticSlot[]
    const matrix:Record<string,number>={'A:one':100,'A:two':99,'B:one':98,'B:two':0}
    const result=assignUniqueXI([player('A'),player('B')],slots,(p,s)=>matrix[`${p.id}:${s.id}`])
    expect(result.reduce((sum,item)=>sum+item.score,0)).toBe(197)
    expect(result.find(item=>item.slotId==='one')?.playerId).toBe('B')
  })
})
