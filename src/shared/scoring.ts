import type { Appearance, Player, RoleDefinition, RoleScore, TacticSlot } from './types'

export const positionAdjustedScore = (player: Player, position: string, score: number) => {
  const index=player.positions.indexOf(position)
  return index<0 ? Number.NEGATIVE_INFINITY : score-Math.min(index,3)*4
}

const role = (id:string,name:string,eligiblePositions:string[],attributeWeights:Record<string,number>):RoleDefinition => ({id,name,eligiblePositions,attributeWeights,performanceWeights:{rating:100}})
export const ROLE_LIBRARY: RoleDefinition[] = [
  role('gk','Goalkeeper',['GK'],{gkreflexes:25,gkhandling:20,gkpositioning:20,gkdiving:20,reactions:10,composure:5}),
  role('gk-sweeper','Sweeper Keeper',['GK'],{gkreflexes:20,gkhandling:15,gkpositioning:20,gkdiving:15,gkkicking:15,shortpassing:10,composure:5}),
  role('gk-ball','Ball-Playing Keeper',['GK'],{gkreflexes:20,gkhandling:18,gkpositioning:18,shortpassing:16,longpassing:14,composure:14}),
  role('fullback','Fullback',['LB','RB'],{defensiveawareness:20,standingtackle:18,interceptions:17,stamina:17,sprintspeed:14,shortpassing:14}),
  role('wingback','Wingback',['LB','RB'],{stamina:20,sprintspeed:18,crossing:18,standingtackle:16,interceptions:14,ballcontrol:14}),
  role('inverted-wingback','Inverted Wingback',['LB','RB'],{shortpassing:20,vision:18,ballcontrol:18,composure:16,interceptions:14,stamina:14}),
  role('centre-back','Defender',['CB'],{defensiveawareness:22,standingtackle:20,interceptions:18,strength:15,headingaccuracy:15,composure:10}),
  role('stopper','Stopper',['CB'],{standingtackle:22,aggression:18,strength:18,interceptions:17,defensiveawareness:15,headingaccuracy:10}),
  role('ball-playing-defender','Ball-Playing Defender',['CB'],{defensiveawareness:18,standingtackle:17,composure:17,shortpassing:17,longpassing:16,interceptions:15}),
  role('wide-back','Wide Back',['CB'],{defensiveawareness:20,standingtackle:17,interceptions:16,sprintspeed:14,shortpassing:13,crossing:10,strength:10}),
  role('holding','Holding',['CDM','CM'],{defensiveawareness:20,interceptions:20,standingtackle:18,stamina:16,composure:14,shortpassing:12}),
  role('deep-playmaker','Deep-Lying Playmaker',['CDM','CM'],{vision:20,shortpassing:20,longpassing:18,composure:16,ballcontrol:14,interceptions:12}),
  role('box-to-box','Box-to-Box',['CM'],{stamina:22,shortpassing:16,ballcontrol:15,reactions:14,standingtackle:12,positioning:11,finishing:10}),
  role('box-crasher','Box Crasher',['CDM','CM','CAM'],{positioning:20,stamina:18,finishing:17,reactions:16,ballcontrol:15,shortpassing:14}),
  role('playmaker','Playmaker',['CM','CAM','CDM'],{vision:22,shortpassing:20,longpassing:18,ballcontrol:15,composure:15,reactions:10}),
  role('wide-midfielder','Wide Midfielder',['LM','RM'],{stamina:20,crossing:18,shortpassing:17,ballcontrol:16,sprintspeed:15,standingtackle:14}),
  role('winger','Winger',['LM','RM','LW','RW'],{acceleration:18,sprintspeed:17,dribbling:18,crossing:17,ballcontrol:16,stamina:14}),
  role('wide-playmaker','Wide Playmaker',['LM','RM','LW','RW'],{vision:22,crossing:18,shortpassing:18,ballcontrol:16,dribbling:14,composure:12}),
  role('inside-forward','Inside Forward',['LM','RM','LW','RW'],{finishing:20,positioning:18,dribbling:17,acceleration:16,ballcontrol:15,reactions:14}),
  role('shadow-striker','Shadow Striker',['CAM'],{positioning:22,finishing:20,reactions:17,acceleration:15,ballcontrol:14,stamina:12}),
  role('advanced-forward','Advanced Forward',['ST'],{finishing:22,positioning:20,acceleration:16,sprintspeed:14,dribbling:14,ballcontrol:14}),
  role('poacher','Poacher',['ST'],{finishing:28,positioning:25,reactions:18,acceleration:12,ballcontrol:10,volleys:7}),
  role('false-nine','False 9',['ST'],{vision:21,shortpassing:20,ballcontrol:19,dribbling:16,positioning:14,composure:10}),
  role('target-forward','Target Forward',['ST'],{strength:22,headingaccuracy:20,positioning:18,finishing:16,ballcontrol:14,jumping:10}),
]

const weighted = (values: Record<string, number>, weights: Record<string, number>) => {
  let total = 0, weight = 0
  for (const [key, amount] of Object.entries(weights)) {
    if (values[key] !== undefined) { total += values[key] * amount; weight += amount }
  }
  return weight ? total / weight : 0
}

function recentPerformance(appearances: Appearance[]) {
  const recent = appearances.filter(a => a.rating !== undefined).slice(-5)
  if (!recent.length) return { score: 0, sample: 0 }
  let score = 0, minutes = 0
  for (const appearance of recent) {
    const weight = appearance.minutes > 0 ? appearance.minutes : 1
    score += appearance.rating! * 10 * weight
    minutes += weight
  }
  return { score: score / minutes, sample: recent.length }
}

export function scorePlayer(player: Player, role: RoleDefinition, appearances: Appearance[]): RoleScore {
  if (player.injured || player.suspended) return { playerId: player.id, roleId: role.id, total: 0, attributes: 0, performance: 0, condition: 0, familiarity: 0, sampleSize: 0, confidence: 'Basic', missingEvidence: [], excluded: player.injured ? 'Injured' : 'Suspended' }
  const roleAttributes = weighted(player.attributes, role.attributeWeights)
  const attributes = roleAttributes || player.overall
  const recent = recentPerformance(appearances.filter(a => a.playerId === player.id))
  const components: [number, number][] = [[attributes,70]]
  if (recent.sample) components.push([recent.score,30])
  const total = components.reduce((sum, [score, weight]) => sum + score * weight, 0) / components.reduce((sum, [, weight]) => sum + weight, 0)
  const missingEvidence = [!roleAttributes && 'role attributes (using OVR)', !recent.sample && 'recent match ratings'].filter(Boolean) as string[]
  return { playerId: player.id, roleId: role.id, total: Math.round(total * 10) / 10, attributes: Math.round(attributes * 10) / 10, performance: Math.round(recent.score * 10) / 10, condition: 0, familiarity: 0, sampleSize: recent.sample, confidence: recent.sample >= 5 ? 'Strong' : recent.sample >= 3 ? 'Standard' : 'Basic', missingEvidence }
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

export function squadDepth(players: Player[], slots: TacticSlot[]) {
  const unit = (position:string) => ({LB:'FB',RB:'FB',LM:'WM',RM:'WM',LW:'WG',RW:'WG'}[position] ?? position)
  const label:Record<string,string>={GK:'Goalkeeper unit',FB:'Fullback unit',CB:'Centre-back unit',WM:'Wide-midfield unit',WG:'Winger unit',CDM:'Defensive-midfield unit',CM:'Central-midfield unit',CAM:'Attacking-midfield unit',ST:'Striker unit'}
  const used=new Set<string>()
  const starterBySlot=new Map<string,Player>()
  for(const slot of slots) {
    const imported=players.find(player=>player.id===slot.playerId&&player.positions.includes(slot.position)&&!used.has(player.id))
    const starter=imported??players.filter(player=>player.positions.includes(slot.position)&&!used.has(player.id)).sort((a,b)=>b.overall-a.overall)[0]
    if(starter){used.add(starter.id);starterBySlot.set(slot.id,starter)}
  }
  const units=[...new Set(slots.map(slot=>unit(slot.position)))].map(code=>{
    const unitSlots=slots.filter(slot=>unit(slot.position)===code)
    const positions=[...new Set(unitSlots.map(slot=>slot.position))]
    const ranked=players.filter(player=>player.positions.some(position=>positions.includes(position))).sort((a,b)=>b.overall-a.overall)
    const starterCount=unitSlots.length
    const reserveTarget=code==='GK'?2:1
    return {code,label:label[code]??`${code} unit`,slot:unitSlots[0],unitSlots,positions,ranked,starterCount,reserveTarget}
  }).sort((a,b)=>(a.ranked.length-a.starterCount)-(b.ranked.length-b.starterCount))
  const rotationUsed=new Set<string>()
  return units.map(info=>{
    const starters=info.unitSlots.map(slot=>starterBySlot.get(slot.id)).filter(Boolean) as Player[]
    const reserves=info.ranked.filter(player=>!used.has(player.id)&&!rotationUsed.has(player.id)).slice(0,info.reserveTarget)
    reserves.forEach(player=>rotationUsed.add(player.id))
    const cover=info.ranked.find(player=>!starters.some(starter=>starter.id===player.id)&&!reserves.some(reserve=>reserve.id===player.id)&&player.positions.slice(1).some(position=>info.positions.includes(position)))
    const coverUnits=cover?units.filter(candidate=>cover.positions.some(position=>candidate.positions.includes(position))).length:0
    const targetDepth=info.starterCount+info.reserveTarget
    const filled=starters.length+reserves.length
    return {code:info.code,label:info.label,slot:info.slot,starter:starters[0]??info.ranked[0],rotation:reserves[0],cover,coverConflict:coverUnits>1,depth:info.ranked.length,targetDepth,available:info.ranked.filter(player=>!player.injured&&!player.suspended).length,shortfall:Math.max(0,targetDepth-filled)}
  }).sort((a,b)=>b.shortfall/b.targetDepth-a.shortfall/a.targetDepth)
}

export const squadNeeds=(players:Player[],slots:TacticSlot[])=>squadDepth(players,slots).filter(need=>need.shortfall>0)

export function playerDecision({starter,fitGap,performance,sample,minutes,alternativeGap,depthSafe}:{starter:boolean;fitGap:number;performance:number;sample:number;minutes:number;alternativeGap:number;depthSafe:boolean}) {
  if (!starter && depthSafe && sample >= 10 && minutes >= 600 && fitGap < -5 && performance < 60) return 'Review sale'
  if (sample < 5 || minutes < 300) return
  if (starter && performance < 60) return 'Consider bench'
  if (starter && alternativeGap >= 5) return 'Try alternative'
}
