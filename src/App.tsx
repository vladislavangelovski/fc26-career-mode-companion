import { useEffect, useMemo, useState } from 'react'
import { assignUniqueXI, positionAdjustedScore, ROLE_LIBRARY, scorePlayer, squadNeeds } from './shared/scoring'
import type { AnalystState, Match, OCRValue, Player, RoleDefinition, RoleScore, Tactic, TacticSlot } from './shared/types'
import { currentSeason, filteredMatches, matchSeries, playerMetric, snapshotSeries, teamMetric, type TrendRange, type TrendSeries } from './shared/trends'

type View = 'Overview' | 'Squad' | 'Matches' | 'Trends' | 'Tactics' | 'Recommendations'
const views: { name: View; key: string }[] = [{ name: 'Overview', key: '01' }, { name: 'Squad', key: '02' }, { name: 'Matches', key: '03' }, { name: 'Trends', key: '04' }, { name: 'Tactics', key: '05' }, { name: 'Recommendations', key: '06' }]
const date = (value?: string) => value ? new Intl.DateTimeFormat('en-GB', { day: '2-digit', month: 'short' }).format(new Date(value)) : '—'
const result = (match: Match) => match.teamScore === undefined || match.opponentScore === undefined ? '—' : match.teamScore > match.opponentScore ? 'W' : match.teamScore < match.opponentScore ? 'L' : 'D'
const ROLE_MODEL: Record<string, string> = {
  Goalkeeper:'gk-ball','Ball-Playing Keeper':'gk-ball',Fullback:'wide-back',Falseback:'inverted-wingback',Wingback:'wide-back','Attacking Wingback':'wide-back','Inverted Wingback':'inverted-wingback',
  Defender:'centre-back',Stopper:'centre-back','Ball-Playing Defender':'centre-back','Wide Back':'centre-back',Holding:'playmaker','Centre Half':'centre-back','Deep-Lying Playmaker':'playmaker','Wide Half':'wide-back',
  'Box-to-Box':'box-crasher',Playmaker:'playmaker','Half-Winger':'playmaker',Winger:'versatile-forward','Wide Midfielder':'versatile-forward','Wide Playmaker':'playmaker','Inside Forward':'versatile-forward',
  'Shadow Striker':'box-crasher','Half Winger':'playmaker','Classic 10':'playmaker','False Winger':'playmaker','Advanced Forward':'versatile-forward',Poacher:'versatile-forward','False 9':'playmaker','Target Forward':'versatile-forward','Roaming Striker':'versatile-forward',
}
const roleFor = (slot: TacticSlot) => ROLE_LIBRARY.find(role => role.id === ROLE_MODEL[slot.role]) ?? ROLE_LIBRARY.find(role => role.id === slot.role || role.name === slot.role) ?? ROLE_LIBRARY.find(role => role.eligiblePositions.includes(slot.position)) ?? ROLE_LIBRARY[ROLE_LIBRARY.length - 1]
const FC_ROLES: Record<string, string[]> = {
  GK:['Goalkeeper','Sweeper Keeper','Ball-Playing Keeper'], RB:['Fullback','Falseback','Wingback','Attacking Wingback','Inverted Wingback'], LB:['Fullback','Falseback','Wingback','Attacking Wingback','Inverted Wingback'],
  CB:['Defender','Stopper','Ball-Playing Defender','Wide Back'], CDM:['Holding','Centre Half','Deep-Lying Playmaker','Wide Half','Box Crasher'], CM:['Box-to-Box','Holding','Deep-Lying Playmaker','Playmaker','Half-Winger'],
  RM:['Winger','Wide Midfielder','Wide Playmaker','Inside Forward'], LM:['Winger','Wide Midfielder','Wide Playmaker','Inside Forward'], CAM:['Playmaker','Shadow Striker','Half Winger','Classic 10'],
  RW:['Winger','Inside Forward','Wide Playmaker','False Winger'], LW:['Winger','Inside Forward','Wide Playmaker','False Winger'], ST:['Advanced Forward','Poacher','False 9','Target Forward','Roaming Striker'],
}
const playerApps = (state: AnalystState, id: string) => state.matches.flatMap(match => match.appearances).filter(app => app.playerId === id)

function scoreFor(state: AnalystState, player: Player, slot: TacticSlot) {
  return positionAdjustedScore(player,slot.position,scorePlayer(player,roleFor(slot),playerApps(state,player.id)).total)
}

const activeTactic = (state: AnalystState) => state.tactics[0]
const evidenceMatches = (state: AnalystState) => state.matches.filter(match => match.appearances.length).length

function Pitch({ tactic, state, selected, onSelect, assignments }: { tactic: Tactic; state: AnalystState; selected?: string; onSelect?: (id: string) => void; assignments?: Map<string, string> }) {
  return <div className="pitch" aria-label={`${tactic.formation} tactical pitch`}>
    <div className="pitch-markings"><i/><i/><i/></div>
    {tactic.slots.map((slot, index) => {
      const playerId = assignments ? assignments.get(slot.id) : slot.playerId
      const player = state.players.find(item => item.id === playerId)
      const x = Math.max(5, Math.min(95, slot.x))
      const y = Math.max(5, Math.min(88, slot.y))
      return <button key={slot.id} className={`pitch-player ${selected === slot.id ? 'selected' : ''}`} style={{ left: `${x}%`, top: `${y}%` }} onClick={() => onSelect?.(slot.id)}>
        <span>{player?.number || slot.position}</span><b>{player?.name?.split(' ').at(-1) || slot.position}</b><small>{slot.role}<em>{slot.focus}</em></small>
      </button>
    })}
  </div>
}

function Meter({ value }: { value: number }) { return <span className="meter"><i style={{ width: `${Math.max(0, Math.min(100, value))}%` }}/><b>{Math.round(value)}</b></span> }
function Empty({ children }: { children: string }) { return <div className="empty"><span>⌁</span>{children}</div> }

const TEAM_PRESETS = {
  attacking: [['goals', 'Goals', 'Telemetry'], ['expectedGoals', 'xG', 'Confirmed OCR']],
  shooting: [['shots', 'Shots', 'Confirmed OCR'], ['shotsOnTarget', 'Shots on target', 'Confirmed OCR']],
  control: [['possession', 'Possession %', 'Confirmed OCR'], ['passAccuracy', 'Pass accuracy %', 'Confirmed OCR']],
  defensive: [['tacklesWon', 'Tackles', 'Confirmed OCR'], ['interceptions', 'Interceptions', 'Confirmed OCR']],
} as const
const PLAYER_METRICS = [
  ['rating','Rating','Telemetry'],['minutes','Minutes','Telemetry'],['goals','Goals','Telemetry'],['assists','Assists','Telemetry'],['expectedGoals','xG','Confirmed OCR'],['shots','Shots','Confirmed OCR'],['shotsOnTarget','Shots on target','Confirmed OCR'],['passes','Passes','Confirmed OCR'],['passAccuracy','Pass accuracy %','Confirmed OCR'],['tacklesWon','Tackles','Confirmed OCR'],['interceptions','Interceptions','Confirmed OCR'],['distanceCovered','Distance','Confirmed OCR'],['crossesCompleted','Crosses','Confirmed OCR'],['saves','Saves','Telemetry'],['goalsConceded','Goals conceded','Telemetry'],
] as const
const SNAPSHOT_METRICS = [['overall','OVR'],['potential','Potential'],['form','Form'],['fitness','Fitness'],['sharpness','Sharpness'],['morale','Morale']] as const
const displayValue = (value?: number) => value === undefined ? '—' : Number.isInteger(value) ? String(value) : value.toFixed(2).replace(/0+$/,'').replace(/\.$/,'')

function TrendChart({ series, onPoint }: { series: TrendSeries[]; onPoint?: (matchId: string) => void }) {
  const [active, setActive] = useState<string>()
  const values = series.flatMap(item => item.points.flatMap(point => point.value === undefined ? [] : [point.value]))
  if (!values.length) return <Empty>No values are available for this selection. Confirmed screenshot metrics remain blank until reviewed.</Empty>
  const width=1000,height=360,left=58,right=24,top=32,bottom=52
  const rawMin=Math.min(...values),rawMax=Math.max(...values),min=rawMin===rawMax?Math.max(0,rawMin-1):Math.min(0,rawMin),max=rawMin===rawMax?rawMax+1:rawMax
  const count=Math.max(...series.map(item=>item.points.length),1)
  const x=(index:number)=>left+(count===1?(width-left-right)/2:index*(width-left-right)/(count-1))
  const y=(value:number)=>top+(max-value)*(height-top-bottom)/(max-min||1)
  const segments=(item:TrendSeries)=>{const output:{x:number;y:number}[][]=[];let current:{x:number;y:number}[]=[];item.points.forEach((point,index)=>{if(point.value===undefined){if(current.length)output.push(current);current=[]}else current.push({x:x(index),y:y(point.value)})});if(current.length)output.push(current);return output}
  const activePoint=series.flatMap(item=>item.points.map((point,index)=>({...point,index,series:item.label}))).find(point=>point.id===active)
  return <div className="trend-stage">
    <div className="trend-legend">{series.map((item,index)=><span key={item.id}><i className={`trend-colour c${index}`}/><b>{item.label}</b><small>{item.points.find(point=>point.value!==undefined)?.source??'No data'}</small></span>)}</div>
    <svg className="trend-chart" viewBox={`0 0 ${width} ${height}`} role="img" aria-labelledby="trend-title trend-desc"><title id="trend-title">Current-season performance trend</title><desc id="trend-desc">A line chart with gaps wherever source data is missing. Focus a point for its exact value.</desc>
      {[0,.25,.5,.75,1].map(step=>{const value=max-(max-min)*step,py=top+(height-top-bottom)*step;return <g key={step}><line className="trend-grid" x1={left} x2={width-right} y1={py} y2={py}/><text className="trend-axis" x={left-10} y={py+4} textAnchor="end">{displayValue(value)}</text></g>})}
      {series.map((item,seriesIndex)=><g key={item.id}>{segments(item).map((segment,index)=><polyline key={index} className={`trend-line c${seriesIndex}`} points={segment.map(point=>`${point.x},${point.y}`).join(' ')}/>)}{item.points.map((point,index)=>point.value===undefined?null:<circle key={point.id} className={`trend-point c${seriesIndex}`} cx={x(index)} cy={y(point.value)} r="5" tabIndex={0} role="button" aria-label={`${point.date}, ${point.label}, ${item.label}: ${displayValue(point.value)}, ${point.source}`} onFocus={()=>setActive(point.id)} onBlur={()=>setActive(undefined)} onMouseEnter={()=>setActive(point.id)} onMouseLeave={()=>setActive(undefined)} onClick={()=>point.matchId&&onPoint?.(point.matchId)} onKeyDown={event=>{if((event.key==='Enter'||event.key===' ')&&point.matchId)onPoint?.(point.matchId)}}/>)}</g>)}
      {series[0]?.points.map((point,index)=><text key={point.id} className="trend-axis x" x={x(index)} y={height-20} textAnchor="middle">{date(point.date)}</text>)}
      {activePoint?.value!==undefined&&<g className="trend-tooltip" transform={`translate(${Math.min(width-160,Math.max(90,x(activePoint.index)))},${Math.max(54,y(activePoint.value)-18)})`}><rect x="-78" y="-37" width="156" height="32" rx="2"/><text textAnchor="middle" y="-23">{activePoint.series}: {displayValue(activePoint.value)}</text><text textAnchor="middle" y="-12">{activePoint.source}</text></g>}
    </svg>
    <div className="trend-table-wrap"><table className="trend-table"><caption>Readable chart data; — means the source did not provide a value.</caption><thead><tr><th>Date</th><th>Opponent / snapshot</th>{series.map(item=><th key={item.id}>{item.label}</th>)}</tr></thead><tbody>{series[0]?.points.map((point,index)=><tr key={point.id}><td>{date(point.date)}</td><td>{point.label}</td>{series.map(item=><td key={item.id}>{displayValue(item.points[index]?.value)}<small>{item.points[index]?.value===undefined?'':item.points[index].source}</small></td>)}</tr>)}</tbody></table></div>
  </div>
}

function MiniTrend({ label, values }: { label: string; values: (number | undefined)[] }) {
  const present=values.flatMap(value=>value===undefined?[]:[value]);if(!present.length)return null
  const min=Math.min(...present),max=Math.max(...present),points=values.map((value,index)=>value===undefined?null:`${index*100/Math.max(1,values.length-1)},${30-(value-min)*26/(max-min||1)-2}`).filter(Boolean).join(' ')
  return <div className="mini-trend"><span>{label}</span><svg viewBox="0 0 100 32" preserveAspectRatio="none" role="img" aria-label={`${label} recent trend`}><polyline points={points}/></svg><b>{displayValue(present.at(-1))}</b></div>
}

function Overview({ state, setView }: { state: AnalystState; setView: (view: View) => void }) {
  const tactic = activeTactic(state)
  const recent = state.matches.slice(0, 5)
  const unavailable = state.career.teamId ? state.players.filter(p => p.injured || p.suspended) : []
  const sample = evidenceMatches(state)
  const warnings = tactic && sample >= 3 ? tactic.slots.map(slot => ({ slot, top: Math.max(...state.players.map(p => scoreFor(state, p, slot)), 0) })).filter(item => item.top < 70) : []
  return <>
    <PageTitle eyebrow="Command centre" title={state.career.teamName} note={tactic ? `${state.career.season} · ${tactic.formation}` : 'Waiting for squad and tactics exports'} />
    <div className="overview-grid">
      <section className="pitch-panel"><SectionTitle title="Active system" action={tactic ? 'Edit tactics' : undefined} onAction={() => setView('Tactics')} />{tactic ? <Pitch tactic={tactic} state={state}/> : <Empty>No tactic has been imported from Live Editor yet.</Empty>}</section>
      <aside className="overview-rail">
        <section><SectionTitle title="Last five"/><div className="form-strip">{recent.length ? recent.map(match => <span key={match.id} className={result(match)}>{result(match)}</span>) : <em>NO MATCHES</em>}</div></section>
        <section><SectionTitle title="Availability" count={unavailable.length}/>{unavailable.length ? unavailable.map(p => <Line key={p.id} left={p.name} right={p.injured ? 'Injured' : 'Suspended'} tone="warn"/>) : <Line left="Full squad available" right="Clear" tone="good"/>}</section>
        <section><SectionTitle title="Role warnings" count={warnings.length}/>{sample < 3 ? <Line left="Collecting role evidence" right={`${sample}/3 matches`}/> : warnings.length ? warnings.slice(0, 4).map(({ slot, top }) => <Line key={slot.id} left={`${slot.position} · ${slot.role} · ${slot.focus}`} right={`${Math.round(top)} fit`} tone="warn"/>) : <Line left="Starting roles covered" right="≥ 70" tone="good"/>}</section>
      </aside>
    </div>
    <section className="lower-band"><SectionTitle title="Recent matches" action="Open match room" onAction={() => setView('Matches')}/>{recent.length ? <MatchRows matches={recent}/> : <Empty>Run the telemetry script before a match to begin the timeline.</Empty>}</section>
  </>
}

function Squad({ state }: { state: AnalystState }) {
  const [selectedId, setSelected] = useState(state.players[0]?.id)
  const [sort, setSort] = useState<'name'|'overall'|'age'>('overall')
  const players = state.career.teamId ? [...state.players].sort((a,b) => sort === 'name' ? a.name.localeCompare(b.name) : (b[sort] ?? 0) - (a[sort] ?? 0)) : []
  const selected = state.players.find(p => p.id === selectedId) ?? players[0]
  return <>
    <PageTitle eyebrow="Personnel" title="Squad intelligence" note={`${state.players.length} registered players`} />
    <div className="split-workspace">
      <section className="table-space">
        <div className="toolbar"><span>Sort</span>{(['overall','name','age'] as const).map(key => <button className={sort === key ? 'active' : ''} onClick={() => setSort(key)} key={key}>{key}</button>)}</div>
        {players.length ? <table><thead><tr><th>Player</th><th>Pos</th><th>OVR</th><th>Pot</th><th>Form</th><th>Condition</th><th>Contract</th></tr></thead><tbody>{players.map(player => <tr key={player.id} className={selected?.id === player.id ? 'selected-row' : ''} onClick={() => setSelected(player.id)}><td><strong>{player.name}</strong><small>#{player.number || '—'} · {player.age || '—'} yrs</small></td><td>{player.positions.slice(0,2).join(' / ')}</td><td className="metric">{player.overall}</td><td>{player.potential || '—'}</td><td>{player.form ?? '—'}</td><td>{player.injured ? 'INJ' : player.suspended ? 'SUS' : player.fitness ?? 'Unknown'}</td><td>{player.contractEnd || '—'}</td></tr>)}</tbody></table> : <Empty>Squad data appears after career_snapshot.lua is run in the central hub.</Empty>}
      </section>
      <aside className="inspector">{selected ? <PlayerInspector player={selected} state={state}/> : <Empty>Select a player to inspect.</Empty>}</aside>
    </div>
  </>
}

function PlayerInspector({ player, state }: { player: Player; state: AnalystState }) {
  const apps = playerApps(state, player.id).slice().sort((a,b)=>(state.matches.find(match=>match.id===a.matchId)?.date??'').localeCompare(state.matches.find(match=>match.id===b.matchId)?.date??''))
  const slot = activeTactic(state)?.slots.find(item => item.playerId === player.id)
  const fit = slot ? scorePlayer(player, roleFor(slot), apps) : undefined
  return <><p className="kicker">PLAYER DOSSIER</p><h2>{player.name}</h2><p className="muted">{player.positions.join(' · ')} · OVR {player.overall}</p>
    <div className="hero-number"><span>{player.overall}</span><small>CURRENT OVR</small></div>
    <SectionTitle title="Current FC role"/><Line left={slot ? `${slot.role} · ${slot.focus}` : 'Not in starting XI'} right={fit ? `${fit.total} fit` : '—'} tone="good"/>
    {fit && <ScoreEvidence score={fit}/>}<SectionTitle title="Condition"/>
    <DataGrid values={[['Fitness',player.fitness],['Sharpness',player.sharpness],['Morale',player.morale],['Form',player.form]]}/>
    <SectionTitle title="Development & contract"/><DataGrid values={[['Potential',player.potential],['Age',player.age],['Wage',player.wage ? player.wage.toLocaleString() : undefined],['Contract',player.contractEnd]]}/>
    <SectionTitle title="Recent trends"/><div className="mini-trends"><MiniTrend label="Match rating" values={apps.slice(-8).map(app=>app.rating)}/><MiniTrend label="OVR" values={player.snapshots.slice(-12).map(snapshot=>snapshot.overall)}/></div>
  </>
}

function Matches({ state, onState, requestedId }: { state: AnalystState; onState: (state: AnalystState) => void; requestedId?: string }) {
  const [selectedId, setSelected] = useState(requestedId??state.matches[0]?.id)
  useEffect(()=>{if(requestedId)setSelected(requestedId)},[requestedId])
  const selected = state.matches.find(m => m.id === selectedId) ?? state.matches[0]
  const [review, setReview] = useState<OCRValue[]>(selected?.ocr.values ?? [])
  useEffect(() => setReview(selected?.ocr.values ?? []), [selected?.id, selected?.ocr.values])
  const importImages = async () => { if (!selected) return; await window.fc26.importScreenshots(selected.id) }
  const confirm = async () => { if (selected) onState(await window.fc26.confirmOCR(selected.id, review)) }
  return <>
    <PageTitle eyebrow="Match room" title="Performance archive" note={`${state.matches.length} fixtures preserved`} />
    <div className="match-workspace">
      <aside className="match-list">{state.matches.map(match => <button key={match.id} className={selected?.id === match.id ? 'active' : ''} onClick={() => setSelected(match.id)}><time>{date(match.date)}</time><span><b>{match.opponent}</b><small>{match.competition}</small></span><strong>{match.teamScore ?? '–'} : {match.opponentScore ?? '–'}</strong><em className={result(match)}>{result(match)}</em></button>)}</aside>
      <section className="match-detail">{selected ? <>
        <div className="scoreline"><div><p>{selected.venue || 'fixture'}</p><h2>{state.career.teamName}</h2></div><strong>{selected.teamScore ?? '–'}<i>:</i>{selected.opponentScore ?? '–'}</strong><div><p>{selected.competition}</p><h2>{selected.opponent}</h2></div></div>
        <div className="match-actions"><span className={`status ${selected.ocr.status}`}>{selected.captureLevel === 'telemetry' ? 'TELEMETRY ONLY' : `OCR ${selected.ocr.status.toUpperCase()}`}</span><button className="primary" onClick={importImages}>Add screenshot batch</button></div>
        <SectionTitle title="Appearances" count={selected.appearances.length}/>
        <table><thead><tr><th>Player</th><th>Min</th><th>Pos</th><th>Rating</th><th>G</th><th>A</th><th>Evidence</th></tr></thead><tbody>{selected.appearances.map(a => <tr key={a.id}><td><strong>{state.players.find(p => p.id === a.playerId)?.name || a.playerId}</strong></td><td>{a.minutes}</td><td>{a.position || '—'}</td><td className="metric">{a.rating ?? '—'}</td><td>{a.goals}</td><td>{a.assists}</td><td>{Object.keys(a.detailedMetrics).length ? 'Detailed' : 'Basic'}</td></tr>)}</tbody></table>
        {selected.ocr.status === 'review' && <section className="ocr-review"><SectionTitle title="OCR review" count={review.length}/><p className="muted">Nothing below affects analysis until you confirm it. Values under 90% are flagged; unmatched player pages remain disabled.</p><table><thead><tr><th>Use</th><th>Player</th><th>Field</th><th>Value</th><th>Confidence</th></tr></thead><tbody>{review.map((value,index) => <tr key={value.id} className={value.confidence < 90 || value.unmatchedPlayer ? 'low-confidence' : ''}><td><input type="checkbox" disabled={value.unmatchedPlayer} checked={value.included} onChange={e => setReview(review.map((v,i) => i === index ? {...v,included:e.target.checked}:v))}/></td><td>{value.unmatchedPlayer ? 'Unmatched player' : state.players.find(p => p.id === value.playerId)?.name || 'Team'}</td><td>{value.field}</td><td><input value={value.value} onChange={e => setReview(review.map((v,i) => i === index ? {...v,value:e.target.value}:v))}/></td><td>{value.confidence}%</td></tr>)}</tbody></table><button className="primary confirm" onClick={confirm}>Confirm reviewed values</button></section>}
      </> : <Empty>A played or simulated match will appear after telemetry import.</Empty>}</section>
    </div>
  </>
}

function Trends({ state, openMatch }: { state: AnalystState; openMatch: (matchId: string) => void }) {
  const [scope,setScope]=useState<'team'|'player'>('team')
  const [range,setRange]=useState<TrendRange>(10)
  const [competition,setCompetition]=useState('All')
  const [preset,setPreset]=useState<keyof typeof TEAM_PRESETS>('attacking')
  const season=currentSeason(state)
  const seasonMatches=filteredMatches(state,'all')
  const minuteLeader=state.players.map(player=>({player,minutes:seasonMatches.flatMap(match=>match.appearances).filter(app=>app.playerId===player.id).reduce((sum,app)=>sum+app.minutes,0)})).sort((a,b)=>b.minutes-a.minutes)[0]?.player
  const [playerId,setPlayerId]=useState(minuteLeader?.id??state.players[0]?.id??'')
  const [metric,setMetric]=useState('rating')
  const matches=filteredMatches(state,range,competition)
  const allFiltered=filteredMatches(state,'all',competition)
  const player=state.players.find(item=>item.id===playerId)??minuteLeader
  const availableMatchMetrics=PLAYER_METRICS.filter(([field])=>{
    const values=allFiltered.flatMap(match=>{const app=match.appearances.find(item=>item.playerId===player?.id);return app?[playerMetric(match,app,field)]:[]})
    return values.some(value=>value!==undefined)&&(!['saves','goalsConceded'].includes(field)||player?.positions.includes('GK')||values.some(value=>(value??0)>0))
  })
  const availableSnapshots=SNAPSHOT_METRICS.filter(([field])=>player?.snapshots.some(snapshot=>typeof snapshot[field]==='number'))
  const available=[...availableMatchMetrics,...availableSnapshots]
  useEffect(()=>{if(scope==='player'&&!available.some(([field])=>field===metric))setMetric(available[0]?.[0]??'rating')},[scope,playerId,competition,state.matches.length])
  const teamSeries:TrendSeries[]=TEAM_PRESETS[preset].map(([field,label,source])=>matchSeries(matches,field,label,match=>teamMetric(match,field),source))
  const playerDefinition=available.find(([field])=>field===metric)
  const playerSeries=player&&playerDefinition ? (SNAPSHOT_METRICS.some(([field])=>field===metric)
    ? [snapshotSeries(player.snapshots,metric as keyof typeof player.snapshots[number],playerDefinition[1],range,season)]
    : [matchSeries(matches,metric,playerDefinition[1],match=>{const app=match.appearances.find(item=>item.playerId===player.id);return app?playerMetric(match,app,metric):undefined},playerDefinition[2] as 'Telemetry'|'Confirmed OCR')]) : []
  const competitions=[...new Set(seasonMatches.map(match=>match.competition).filter(Boolean))].sort()
  return <><PageTitle eyebrow="Analysis" title="Current-season trends" note={`${state.career.teamName} · ${season}`} />
    <section className="trend-workspace">
      <div className="trend-toolbar">
        <div className="segmented" aria-label="Trend scope">{(['team','player'] as const).map(value=><button key={value} className={scope===value?'active':''} onClick={()=>setScope(value)}>{value}</button>)}</div>
        <div className="segmented" aria-label="Match range">{([[5,'Last 5'],[10,'Last 10'],['all','All']] as const).map(([value,label])=><button key={value} className={range===value?'active':''} onClick={()=>setRange(value)}>{label}</button>)}</div>
        <label>Competition<select value={competition} onChange={event=>setCompetition(event.target.value)}><option>All</option>{competitions.map(value=><option key={value}>{value}</option>)}</select></label>
      </div>
      <div className="trend-selects">{scope==='team'?<><span>Team view</span>{(Object.keys(TEAM_PRESETS) as (keyof typeof TEAM_PRESETS)[]).map(value=><button key={value} className={preset===value?'active':''} onClick={()=>setPreset(value)}>{value}</button>)}</>:<><label>Player<select value={player?.id??''} onChange={event=>setPlayerId(event.target.value)}>{state.players.map(item=><option key={item.id} value={item.id}>{item.name}</option>)}</select></label><label>Metric<select value={metric} onChange={event=>setMetric(event.target.value)}>{available.map(([field,label])=><option key={field} value={field}>{label}</option>)}</select></label></>}</div>
      <p className="trend-note">{scope==='team'?`${TEAM_PRESETS[preset].map(([,label])=>label).join(' and ')} across ${matches.length} current-season matches.`:`${player?.name??'No player'} · metrics with no source values are hidden.`} Click or press Enter on a match point to open it.</p>
      <TrendChart series={scope==='team'?teamSeries:playerSeries} onPoint={openMatch}/>
    </section>
  </>
}

function Tactics({ state, onState }: { state: AnalystState; onState: (state: AnalystState) => void }) {
  const tactic = activeTactic(state)
  if (!tactic) return <><PageTitle eyebrow="Game model" title="Tactical laboratory" note="Waiting for Live Editor"/><section className="lower-band"><Empty>No tactic export is available. The app will not invent a formation.</Empty></section></>
  return <TacticsEditor state={state} onState={onState} tactic={tactic}/>
}

function TacticsEditor({ state, onState, tactic }: { state: AnalystState; onState: (state: AnalystState) => void; tactic: Tactic }) {
  const [draft, setDraft] = useState(tactic)
  const [selectedId, setSelected] = useState(draft.slots[0]?.id)
  const slot = draft.slots.find(item => item.id === selectedId)
  const updateSlot = (change: Partial<TacticSlot>) => setDraft({...draft, slots: draft.slots.map(item => item.id === selectedId ? {...item,...change}:item)})
  const save = async () => onState(await window.fc26.updateTactic({...draft, corrected:true}))
  return <><PageTitle eyebrow="Game model" title="Tactical laboratory" note={`${draft.formation} · imported values remain editable`} />
    <div className="tactics-layout"><section className="pitch-panel"><Pitch tactic={draft} state={state} selected={selectedId} onSelect={setSelected}/></section>
      <aside className="inspector"><p className="kicker">SELECTED SLOT</p><h2>{slot?.position || '—'}</h2>{slot && <>
        <label>Assigned player<select value={slot.playerId || ''} onChange={e => updateSlot({playerId:e.target.value || undefined})}><option value="">Unassigned</option>{state.players.map(p => <option value={p.id} key={p.id}>{p.name} · {p.overall}</option>)}</select></label>
        <label>Position<select value={slot.position} onChange={e => updateSlot({position:e.target.value,role:FC_ROLES[e.target.value][0]})}>{['GK','LB','CB','RB','CDM','CM','CAM','LM','RM','LW','RW','ST'].map(p => <option key={p}>{p}</option>)}</select></label>
        <label>Role<select value={slot.role} onChange={e => updateSlot({role:e.target.value})}>{(FC_ROLES[slot.position] ?? [slot.role]).map(role => <option key={role}>{role}</option>)}</select></label>
        <label>Focus<select value={slot.focus} onChange={e => updateSlot({focus:e.target.value})}>{['Balanced','Defend','Support','Build-Up','Attack','Versatile','Ball-Winning'].map(f => <option key={f}>{f}</option>)}</select></label>
        <label>X position<input type="range" min="8" max="92" value={slot.x} onChange={e => updateSlot({x:Number(e.target.value)})}/></label><label>Y position<input type="range" min="8" max="92" value={slot.y} onChange={e => updateSlot({y:Number(e.target.value)})}/></label>
        <SectionTitle title="Ranked candidates"/>{state.players.map(player => ({player,score:scoreFor(state,player,slot)})).filter(item=>Number.isFinite(item.score)).sort((a,b)=>b.score-a.score).slice(0,5).map(({player,score},index)=><Line key={player.id} left={`${index+1}. ${player.name}`} right={`${Math.round(score)}`}/>)}</>}
        <button className="primary save-tactic" onClick={save}>Save tactical corrections</button>
      </aside></div></>
}

function Recommendations({ state }: { state: AnalystState }) {
  const tactic = activeTactic(state)
  const xi = tactic ? assignUniqueXI(state.players, tactic.slots, (player,slot) => scoreFor(state,player,slot)) : []
  const assignment = new Map(xi.map(item => [item.slotId,item.playerId]))
  const sample = evidenceMatches(state)
  const needs = tactic ? squadNeeds(state.players,tactic.slots).slice(0,3) : []
  const [selected, setSelected] = useState(xi[0]?.slotId)
  if (!tactic) return <><PageTitle eyebrow="Decision room" title="Squad recommendations" note="Waiting for verified squad and tactics exports"/><section className="lower-band"><Empty>Recommendations stay disabled until a real tactic is imported.</Empty></section></>
  const selectedAssignment = xi.find(item => item.slotId === selected)
  const selectedSlot = tactic.slots.find(slot => slot.id === selected)
  const selectedPlayer = state.players.find(player => player.id === selectedAssignment?.playerId)
  const evidence = selectedPlayer && selectedSlot ? scorePlayer(selectedPlayer, roleFor(selectedSlot), playerApps(state,selectedPlayer.id)) : undefined
  return <><PageTitle eyebrow="Decision room" title="Squad recommendations" note={sample < 3 ? `Provisional role fit · ${sample}/3 matches` : 'Traceable role fit · unique-player assignment'}/>
    <div className="recommend-layout"><section className="pitch-panel"><SectionTitle title="Strongest available XI"/><Pitch tactic={tactic} state={state} assignments={assignment} selected={selected} onSelect={setSelected}/></section>
      <aside className="inspector"><p className="kicker">SELECTION EVIDENCE</p>{selectedPlayer && selectedSlot && evidence ? <><h2>{selectedPlayer.name}</h2><p className="muted">{selectedSlot.role} · {selectedSlot.focus} · {evidence.confidence} confidence</p><div className="hero-number"><span>{evidence.total}</span><small>ROLE FIT / 100</small></div><ScoreEvidence score={evidence}/></> : <Empty>Import squad data to generate the XI.</Empty>}</aside></div>
    <section className="lower-band"><SectionTitle title="Priority squad needs" count={needs.length}/>{needs.length ? <><p className="muted">Structural depth only—not performance or tactical-role upgrades. The model allows rotation and versatile cover: 3 goalkeepers; one rotation option behind single starters; two rotation/cover options behind two-player units.</p><div className="needs-list">{needs.map(({code,label,starter,rotation,depth,targetDepth,available}) => <article key={code}><span>{code}</span><div><h3>{label}</h3><p>{depth}/{targetDepth} options · {available} available · Lead: {starter?.name??'None'} ({starter?.overall??0} OVR) · Rotation: {rotation?.name??'Missing'}{rotation?` (${rotation.overall} OVR)`:''}</p></div><strong>{depth}/{targetDepth}</strong></article>)}</div></> : <Line left="Starting, rotation and cover depth are present" right="Covered" tone="good"/>}</section>
  </>
}

function ScoreEvidence({ score }: { score: RoleScore }) { return <div className="evidence"><div><span>Attributes · 55%</span><Meter value={score.attributes}/></div><div><span>Recent performance · 25%</span><Meter value={score.performance}/></div><div><span>Condition · 15%</span><Meter value={score.condition}/></div><div><span>Role familiarity · 5%</span><Meter value={score.familiarity}/></div><p>{score.sampleSize} qualifying appearances · {score.missingEvidence.length ? `Missing: ${score.missingEvidence.join(', ')}` : 'Full evidence available'}</p></div> }
function PageTitle({ eyebrow,title,note }: { eyebrow:string;title:string;note:string }) { return <header className="page-title"><div><p>{eyebrow}</p><h1>{title}</h1></div><span>{note}</span></header> }
function SectionTitle({ title,count,action,onAction }: { title:string;count?:number;action?:string;onAction?:()=>void }) { return <div className="section-title"><h3>{title}{count !== undefined && <sup>{count}</sup>}</h3>{action && <button onClick={onAction}>{action} →</button>}</div> }
function Line({ left,right,tone }: { left:string;right:string;tone?:string }) { return <div className={`line ${tone||''}`}><span>{left}</span><strong>{right}</strong></div> }
function DataGrid({values}:{values:[string,unknown][]}) { return <div className="data-grid">{values.map(([label,value])=><div key={label}><span>{label}</span><strong>{value === undefined ? 'Not exposed' : String(value)}</strong></div>)}</div> }
function MatchRows({matches}:{matches:Match[]}) { return <div className="match-rows">{matches.map(match=><div key={match.id}><time>{date(match.date)}</time><strong className={result(match)}>{result(match)}</strong><span>{match.opponent}</span><b>{match.teamScore ?? '–'} : {match.opponentScore ?? '–'}</b><small>{match.captureLevel === 'played' ? 'DETAILED' : 'TELEMETRY'}</small></div>)}</div> }

function Settings({ state, close, onState }: { state:AnalystState;close:()=>void;onState:(s:AnalystState)=>void }) {
  const [settings,setSettings]=useState(state.settings)
  const save=async()=>{onState(await window.fc26.updateSettings(settings));close()}
  return <div className="modal-backdrop" onMouseDown={close}><div className="modal" onMouseDown={e=>e.stopPropagation()}><p className="kicker">LOCAL SOURCES</p><h2>Live Editor bridge</h2>{Object.entries(settings).map(([key,value])=><label key={key}>{key.replace('Path','').replace(/^./,c=>c.toUpperCase())} CSV<input value={value} onChange={e=>setSettings({...settings,[key]:e.target.value})}/></label>)}<div className="modal-actions"><button onClick={close}>Cancel</button><button className="primary" onClick={save}>Save & import</button></div><hr/><button onClick={()=>window.fc26.backup()}>Export career backup</button><button onClick={async()=>{const restored=await window.fc26.restore();if(restored){onState(restored);close()}}}>Restore backup</button></div></div>
}

export default function App() {
  const [state,setState]=useState<AnalystState>()
  const [view,setView]=useState<View>('Overview')
  const [selectedMatchId,setSelectedMatchId]=useState<string>()
  const [settings,setSettings]=useState(false)
  const openMatch=(matchId:string)=>{setSelectedMatchId(matchId);setView('Matches')}
  useEffect(()=>{void window.fc26.getState().then(setState);return window.fc26.onStateChanged(setState)},[])
  if(!state) return <div className="boot"><i/>Loading career intelligence…</div>
  return <div className="app-shell"><aside className="sidebar"><div className="brand"><span>FC</span><div><b>CAREER</b><small>ANALYST / 26</small></div></div><nav>{views.map(item=><button key={item.name} className={view===item.name?'active':''} onClick={()=>setView(item.name)}><span>{item.key}</span>{item.name}</button>)}</nav><div className="side-footer"><div className={`sync-dot ${state.sync.status}`}/><span><b>{state.sync.status}</b><small>{state.sync.message}</small></span><button title="Settings" onClick={()=>setSettings(true)}>⚙</button></div></aside>
    <main>{view==='Overview'&&<Overview state={state} setView={setView}/>} {view==='Squad'&&<Squad state={state}/>} {view==='Matches'&&<Matches state={state} onState={setState} requestedId={selectedMatchId}/>} {view==='Trends'&&<Trends state={state} openMatch={openMatch}/>} {view==='Tactics'&&<Tactics state={state} onState={setState}/>} {view==='Recommendations'&&<Recommendations state={state}/>}</main>
    {settings&&<Settings state={state} close={()=>setSettings(false)} onState={setState}/>}</div>
}
