import type { Appearance, Player, RoleDefinition, RoleScore, TacticSlot } from './types'

export const positionAdjustedScore = (player: Player, position: string, score: number) => {
  const index=player.positions.indexOf(position)
  return index<0 ? Number.NEGATIVE_INFINITY : score-Math.min(index,3)*4
}

export const ROLE_LIBRARY: RoleDefinition[] = [
  { id: 'gk-ball', name: 'Ball-Playing Keeper', eligiblePositions: ['GK'], attributeWeights: { gkreflexes: 20, gkhandling: 18, gkpositioning: 18, shortpassing: 16, longpassing: 14, composure: 14 }, performanceWeights: { saves: 55, passAccuracy: 25, rating: 20 } },
  { id: 'wide-back', name: 'Wide Back', eligiblePositions: ['LB', 'RB'], attributeWeights: { stamina: 18, sprintspeed: 18, crossing: 16, standingtackle: 16, interceptions: 16, ballcontrol: 16 }, performanceWeights: { tacklesWon: 25, interceptions: 20, crossesCompleted: 20, passAccuracy: 15, rating: 20 } },
  { id: 'inverted-wingback', name: 'Inverted Wingback', eligiblePositions: ['LB', 'RB'], attributeWeights: { shortpassing: 20, vision: 18, ballcontrol: 18, composure: 16, interceptions: 14, stamina: 14 }, performanceWeights: { passAccuracy: 30, progressivePasses: 25, interceptions: 20, rating: 25 } },
  { id: 'box-crasher', name: 'Box Crasher', eligiblePositions: ['CM', 'CAM'], attributeWeights: { positioning: 20, stamina: 18, finishing: 17, reactions: 16, ballcontrol: 15, shortpassing: 14 }, performanceWeights: { goals: 30, shotsOnTarget: 20, touchesInBox: 20, rating: 30 } },
  { id: 'versatile-forward', name: 'Versatile Forward', eligiblePositions: ['ST', 'LW', 'RW', 'LM', 'RM'], attributeWeights: { finishing: 20, positioning: 18, acceleration: 16, ballcontrol: 16, shortpassing: 15, stamina: 15 }, performanceWeights: { goals: 30, assists: 20, chancesCreated: 20, rating: 30 } },
  { id: 'centre-back', name: 'Defender', eligiblePositions: ['CB'], attributeWeights: { defensiveawareness: 22, standingtackle: 20, interceptions: 18, strength: 15, headingaccuracy: 15, composure: 10 }, performanceWeights: { tacklesWon: 25, interceptions: 25, aerialDuelsWon: 20, rating: 30 } },
  { id: 'playmaker', name: 'Playmaker', eligiblePositions: ['CM', 'CAM', 'CDM'], attributeWeights: { vision: 22, shortpassing: 20, longpassing: 18, ballcontrol: 15, composure: 15, reactions: 10 }, performanceWeights: { chancesCreated: 30, progressivePasses: 25, passAccuracy: 20, rating: 25 } },
]

const weighted = (values: Record<string, number>, weights: Record<string, number>) => {
  let total = 0, weight = 0
  for (const [key, amount] of Object.entries(weights)) {
    if (values[key] !== undefined) { total += values[key] * amount; weight += amount }
  }
  return weight ? total / weight : 0
}

function recentPerformance(appearances: Appearance[], weights: Record<string, number>) {
  const recent = appearances.filter(a => a.minutes > 0).slice(-5)
  if (!recent.length) return { score: 50, sample: 0, detailed: false }
  let score = 0, minutes = 0, detailed = false
  for (const appearance of recent) {
    const metrics = { ...appearance.detailedMetrics, goals: appearance.goals * 90 / appearance.minutes, assists: appearance.assists * 90 / appearance.minutes, saves: appearance.saves * 90 / appearance.minutes, rating: (appearance.rating ?? 5) * 10 }
    detailed ||= Object.keys(appearance.detailedMetrics).length > 0
    const performance = detailed ? weighted(metrics, weights) : (appearance.rating ?? 5) * 10
    score += performance * appearance.minutes
    minutes += appearance.minutes
  }
  return { score: minutes ? score / minutes : 50, sample: recent.length, detailed }
}

export function scorePlayer(player: Player, role: RoleDefinition, appearances: Appearance[]): RoleScore {
  if (player.injured || player.suspended) return { playerId: player.id, roleId: role.id, total: 0, attributes: 0, performance: 0, condition: 0, familiarity: 0, sampleSize: 0, confidence: 'Basic', missingEvidence: [], excluded: player.injured ? 'Injured' : 'Suspended' }
  const attributes = weighted(player.attributes, role.attributeWeights) || player.overall
  const recent = recentPerformance(appearances.filter(a => a.playerId === player.id), role.performanceWeights)
  const conditionParts = [[player.fitness,.4],[player.sharpness,.3],[player.morale,.2],[player.form,.1]] as [number | undefined, number][]
  const exposedCondition = conditionParts.filter(([value]) => value !== undefined) as [number, number][]
  const conditionWeight = exposedCondition.reduce((sum, [, weight]) => sum + weight, 0)
  const condition = conditionWeight ? exposedCondition.reduce((sum, [value, weight]) => sum + value * weight, 0) / conditionWeight : 0
  const familiarity = player.familiarity[role.id]
  const components: [number, number][] = [[attributes,55]]
  if (recent.sample) components.push([recent.score,25])
  if (conditionWeight) components.push([condition,15])
  if (familiarity !== undefined) components.push([familiarity,5])
  const total = components.reduce((sum, [score, weight]) => sum + score * weight, 0) / components.reduce((sum, [, weight]) => sum + weight, 0)
  const missingEvidence = [player.fitness === undefined && 'fitness', player.sharpness === undefined && 'sharpness', player.morale === undefined && 'morale', !recent.sample && 'recent performance', !recent.detailed && 'detailed match metrics', familiarity === undefined && 'role familiarity'].filter(Boolean) as string[]
  return { playerId: player.id, roleId: role.id, total: Math.round(total * 10) / 10, attributes: Math.round(attributes), performance: Math.round(recent.score), condition: Math.round(condition), familiarity: familiarity ?? 0, sampleSize: recent.sample, confidence: recent.detailed && recent.sample >= 3 && missingEvidence.length < 2 ? 'Strong' : recent.sample ? 'Standard' : 'Basic', missingEvidence }
}

export function assignUniqueXI(players: Player[], slots: TacticSlot[], scores: (player: Player, slot: TacticSlot) => number) {
  type State = { score: number; assignments: { slotId: string; playerId: string; score: number }[] }
  let states = new Map<number, State>([[0, { score: 0, assignments: [] }]])
  for (const player of players.filter(p => !p.injured && !p.suspended)) {
    const next = new Map(states)
    for (const [mask, state] of states) for (let index = 0; index < slots.length; index++) {
      if (mask & (1 << index)) continue
      const value = scores(player, slots[index])
      if (!Number.isFinite(value)) continue
      const nextMask = mask | (1 << index)
      const candidate = { score: state.score + value, assignments: [...state.assignments, { slotId: slots[index].id, playerId: player.id, score: value }] }
      if ((next.get(nextMask)?.score ?? -1) < candidate.score) next.set(nextMask, candidate)
    }
    states = next
  }
  return states.get((1 << slots.length) - 1)?.assignments ?? [...states.values()].sort((a,b)=>b.assignments.length-a.assignments.length||b.score-a.score)[0].assignments
}

export function squadNeeds(players: Player[], slots: TacticSlot[]) {
  const unit = (position:string) => ({LB:'FB',RB:'FB',LM:'WM',RM:'WM',LW:'WG',RW:'WG'}[position] ?? position)
  const label:Record<string,string>={GK:'Goalkeeper unit',FB:'Fullback unit',CB:'Centre-back unit',WM:'Wide-midfield unit',WG:'Winger unit',CDM:'Defensive-midfield unit',CM:'Central-midfield unit',CAM:'Attacking-midfield unit',ST:'Striker unit'}
  return [...new Set(slots.map(slot=>unit(slot.position)))].map(code=>{
    const unitSlots=slots.filter(slot=>unit(slot.position)===code)
    const positions=[...new Set(unitSlots.map(slot=>slot.position))]
    const ranked=players.filter(player=>player.positions.some(position=>positions.includes(position))).sort((a,b)=>b.overall-a.overall)
    const starterCount=unitSlots.length
    const targetDepth=starterCount+(code==='GK'?2:starterCount>1?2:1)
    return {code,label:label[code]??`${code} unit`,slot:unitSlots[0],starter:ranked[0],rotation:ranked[starterCount],depth:ranked.length,targetDepth,available:ranked.filter(player=>!player.injured&&!player.suspended).length,shortfall:Math.max(0,targetDepth-ranked.length)}
  }).filter(need=>need.shortfall>0).sort((a,b)=>b.shortfall/b.targetDepth-a.shortfall/a.targetDepth)
}
