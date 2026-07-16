import { useEffect, useState } from 'react'
import { playerDecision, positionAdjustedScore, ROLE_LIBRARY, scorePlayer, squadDepth, squadNeeds } from './shared/scoring'
import type { AnalystState, Match, Player, RoleDefinition, RoleScore, Tactic, TacticSlot } from './shared/types'
import { currentSeason, filteredMatches, matchSeries, playerMetric, snapshotSeries, teamMetric, type TrendRange, type TrendSeries } from './shared/trends'
import { roleFocuses } from './shared/telemetry'

type View = 'Overview' | 'Performance' | 'Squad' | 'Tactics' | 'Opponent'
const views: { name: View; key: string }[] = [{ name: 'Overview', key: '01' }, { name: 'Performance', key: '02' }, { name: 'Squad', key: '03' }, { name: 'Tactics', key: '04' }, { name: 'Opponent', key: '05' }]
const date = (value?: string) => value ? new Intl.DateTimeFormat('en-GB', { day: '2-digit', month: 'short' }).format(new Date(value)) : '—'
const result = (match: Match) => match.teamScore === undefined || match.opponentScore === undefined ? '—' : match.teamScore > match.opponentScore ? 'W' : match.teamScore < match.opponentScore ? 'L' : 'D'
const ROLE_MODEL: Record<string, string> = {
  Goalkeeper:'gk','Sweeper Keeper':'gk-sweeper','Ball-Playing Keeper':'gk-ball',Fullback:'fullback',Falseback:'inverted-wingback',Wingback:'wingback','Attacking Wingback':'wingback','Inverted Wingback':'inverted-wingback',
  Defender:'centre-back',Stopper:'stopper','Ball-Playing Defender':'ball-playing-defender','Wide Back':'wide-back',Holding:'holding','Centre Half':'centre-back','Deep-Lying Playmaker':'deep-playmaker','Wide Half':'wide-midfielder',
  'Box-to-Box':'box-to-box','Box Crasher':'box-crasher',Playmaker:'playmaker','Half-Winger':'wide-playmaker',Winger:'winger','Wide Midfielder':'wide-midfielder','Wide Playmaker':'wide-playmaker','Inside Forward':'inside-forward',
  'Shadow Striker':'shadow-striker','Half Winger':'wide-playmaker','Classic 10':'playmaker','False Winger':'wide-playmaker','Advanced Forward':'advanced-forward',Poacher:'poacher','False 9':'false-nine','Target Forward':'target-forward','Roaming Striker':'advanced-forward',
}
const roleFor = (slot: TacticSlot) => ROLE_LIBRARY.find(role => role.id === ROLE_MODEL[slot.role]) ?? ROLE_LIBRARY.find(role => role.id === slot.role || role.name === slot.role)
const FC_ROLES: Record<string, string[]> = {
  GK:['Goalkeeper','Sweeper Keeper','Ball-Playing Keeper'], RB:['Fullback','Falseback','Wingback','Attacking Wingback','Inverted Wingback'], LB:['Fullback','Falseback','Wingback','Attacking Wingback','Inverted Wingback'],
  CB:['Defender','Stopper','Ball-Playing Defender','Wide Back'], CDM:['Holding','Centre Half','Deep-Lying Playmaker','Wide Half','Box Crasher'], CM:['Box-to-Box','Holding','Deep-Lying Playmaker','Playmaker','Half-Winger'],
  RM:['Winger','Wide Midfielder','Wide Playmaker','Inside Forward'], LM:['Winger','Wide Midfielder','Wide Playmaker','Inside Forward'], CAM:['Playmaker','Shadow Striker','Half-Winger','Classic 10'],
  RW:['Winger','Inside Forward','Wide Playmaker'], LW:['Winger','Inside Forward','Wide Playmaker'], ST:['Advanced Forward','Poacher','False 9','Target Forward'],
}
const playerApps = (state: AnalystState, id: string) => state.matches.filter(match => match.seasonId === currentSeason(state)).sort((a,b)=>a.date.localeCompare(b.date)).flatMap(match => match.appearances).filter(app => app.playerId === id)

function scoreFor(state: AnalystState, player: Player, slot: TacticSlot) {
  const role=roleFor(slot)
  return role ? positionAdjustedScore(player,slot.position,scorePlayer(player,role,playerApps(state,player.id)).total) : Number.NEGATIVE_INFINITY
}

const activeTactic = (state: AnalystState) => [...state.tactics].sort((a,b)=>b.slots.filter(slot=>slot.playerId).length-a.slots.filter(slot=>slot.playerId).length)[0]

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

function Meter({ value }: { value: number }) { return <span className="meter"><i style={{ width: `${Math.max(0, Math.min(100, value))}%` }}/><b>{Number.isInteger(value)?value:value.toFixed(1)}</b></span> }
function Empty({ children }: { children: string }) { return <div className="empty"><span>⌁</span>{children}</div> }

const TEAM_METRICS = [['goals','Goals for'],['goalsConceded','Goals against'],['goalDifference','Goal difference']] as const
const PLAYER_METRICS = [
  ['rating','Rating'],['minutes','Minutes'],['goals','Goals'],['assists','Assists'],['saves','Saves'],['goalsConceded','Goals conceded'],
] as const
const SNAPSHOT_METRICS = [['overall','OVR'],['potential','Potential'],['form','Form'],['fitness','Fitness'],['sharpness','Sharpness'],['morale','Morale']] as const
const displayValue = (value?: number) => value === undefined ? '—' : Number.isInteger(value) ? String(value) : value.toFixed(2).replace(/0+$/,'').replace(/\.$/,'')

function TrendChart({ series, onPoint }: { series: TrendSeries[]; onPoint?: (matchId: string) => void }) {
  const [active, setActive] = useState<string>()
  const values = series.flatMap(item => item.points.flatMap(point => point.value === undefined ? [] : [point.value]))
  if (!values.length) return <Empty>No telemetry values are available for this selection.</Empty>
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
  const min=Math.min(...present),max=Math.max(...present),segments:string[][]=[];let points:string[]=[]
  values.forEach((value,index)=>{if(value===undefined){if(points.length)segments.push(points);points=[]}else points.push(`${index*100/Math.max(1,values.length-1)},${30-(value-min)*26/(max-min||1)-2}`)});if(points.length)segments.push(points)
  return <div className="mini-trend"><span>{label}</span><svg viewBox="0 0 100 32" preserveAspectRatio="none" role="img" aria-label={`${label} recent trend`}>{segments.map((segment,index)=><polyline key={index} points={segment.join(' ')}/>)}</svg><b>{displayValue(present.at(-1))}</b></div>
}

function Overview({ state, setView }: { state: AnalystState; setView: (view: View) => void }) {
  const tactic = activeTactic(state)
  const recent = state.matches.slice(0, 5)
  const unavailable = state.career.teamId ? state.players.filter(p => p.injured || p.suspended) : []
  const supported=state.players.filter(player=>{const apps=playerApps(state,player.id);return apps.filter(app=>app.rating!==undefined).length>=5&&apps.reduce((sum,app)=>sum+app.minutes,0)>=300}).length
  return <>
    <PageTitle eyebrow="Command centre" title={state.career.teamName} note={tactic ? `${currentSeason(state)} · ${tactic.formation}` : 'Waiting for squad and tactics exports'} />
    <div className="overview-grid">
      <section className="pitch-panel"><SectionTitle title="Active system" action={tactic ? 'Edit tactics' : undefined} onAction={() => setView('Tactics')} />{tactic ? <Pitch tactic={tactic} state={state}/> : <Empty>No tactic has been imported from Live Editor yet.</Empty>}</section>
      <aside className="overview-rail">
        <section><SectionTitle title="Next opponent" action={state.opponent?'Open briefing':undefined} onAction={()=>setView('Opponent')}/>{state.opponent?<><Line left={state.opponent.teamName} right={date(state.opponent.date)} tone="good"/><p className="muted">{state.opponent.competition||'Competition pending'}{state.opponent.formation?` · exposed shape ${state.opponent.formation}`:''}</p></>:<Line left="Waiting for the next fixture snapshot" right="Not exposed"/>}</section>
        <section><SectionTitle title="Last five"/><div className="form-strip">{recent.length ? recent.map(match => <span key={match.id} className={result(match)}>{result(match)}</span>) : <em>NO MATCHES</em>}</div></section>
        <section><SectionTitle title="Availability" count={unavailable.length}/>{unavailable.length ? unavailable.map(p => <Line key={p.id} left={p.name} right={p.injured ? 'Injured' : 'Suspended'} tone="warn"/>) : <Line left="Full squad available" right="Clear" tone="good"/>}</section>
        <section><SectionTitle title="Squad evidence"/><Line left="Players meeting the 5-match / 300-minute gate" right={`${supported}/${state.players.length}`} tone={supported?'good':undefined}/></section>
      </aside>
    </div>
    <section className="lower-band"><SectionTitle title="Recent matches" action="Open performance" onAction={() => setView('Performance')}/>{recent.length ? <MatchRows matches={recent}/> : <Empty>Automatic telemetry will begin the timeline after your next match.</Empty>}</section>
    <section className="lower-band"><SectionTitle title="Data coverage"/><SourceHealth state={state}/></section>
  </>
}

function Squad({ state }: { state: AnalystState }) {
  const [selectedId, setSelected] = useState<string>()
  const [sort, setSort] = useState<'name'|'overall'|'age'>('overall')
  const players = state.career.teamId ? [...state.players].sort((a,b) => sort === 'name' ? a.name.localeCompare(b.name) : (b[sort] ?? 0) - (a[sort] ?? 0)) : []
  const selected = state.players.find(p => p.id === selectedId) ?? players[0]
  return <>
    <PageTitle eyebrow="Personnel" title="Squad intelligence" note={`${state.players.length} registered players`} />
    <div className="split-workspace">
      <section className="table-space">
        <div className="toolbar"><span>Sort</span>{(['overall','name','age'] as const).map(key => <button className={sort === key ? 'active' : ''} onClick={() => setSort(key)} key={key}>{key}</button>)}</div>
        {players.length ? <table><thead><tr><th>Player</th><th>Pos</th><th>OVR</th><th>Pot</th><th>Status</th><th>Contract</th></tr></thead><tbody>{players.map(player => <tr key={player.id} className={selected?.id === player.id ? 'selected-row' : ''} onClick={() => setSelected(player.id)}><td><strong>{player.name}</strong><small>#{player.number || '—'} · {player.age || '—'} yrs</small></td><td>{player.positions.slice(0,2).join(' / ')}</td><td className="metric">{player.overall}</td><td>{player.potential || '—'}</td><td>{player.injured ? 'Injured' : player.suspended ? 'Suspended' : 'Available'}</td><td>{player.contractEnd || '—'}</td></tr>)}</tbody></table> : <Empty>Squad data appears after career_snapshot.lua is run in the central hub.</Empty>}
      </section>
      <aside className="inspector">{selected ? <PlayerInspector player={selected} state={state}/> : <Empty>Select a player to inspect.</Empty>}</aside>
    </div>
    <SquadDecisions state={state}/>
  </>
}

function PlayerInspector({ player, state }: { player: Player; state: AnalystState }) {
  const apps = playerApps(state, player.id).slice().sort((a,b)=>(state.matches.find(match=>match.id===a.matchId)?.date??'').localeCompare(state.matches.find(match=>match.id===b.matchId)?.date??''))
  const slot = activeTactic(state)?.slots.find(item => item.playerId === player.id)
  const role = slot ? roleFor(slot) : undefined
  const fit = role ? scorePlayer(player, role, apps) : undefined
  return <><p className="kicker">PLAYER DOSSIER</p><h2>{player.name}</h2><p className="muted">{player.positions.join(' · ')} · OVR {player.overall}</p>
    <div className="hero-number"><span>{player.overall}</span><small>CURRENT OVR</small></div>
    <SectionTitle title="Current FC role"/><Line left={slot ? `${slot.role} · ${slot.focus}` : 'Not in starting XI'} right={fit ? `${fit.total} analyst estimate` : '—'} tone="good"/>
    {fit && <ScoreEvidence score={fit}/>}<SectionTitle title="Availability"/>
    <Line left={player.injured?'Injured':player.suspended?'Suspended':'Available for selection'} right={player.injured||player.suspended?'Unavailable':'Clear'} tone={player.injured||player.suspended?'warn':'good'}/>
    <SectionTitle title="Development & contract"/><DataGrid values={[['Potential',player.potential],['Age',player.age],['Wage',player.wage ? player.wage.toLocaleString() : undefined],['Contract',player.contractMonths?`${player.contractMonths} months`:player.contractEnd]]}/>
    <SectionTitle title="Recent trends"/><div className="mini-trends"><MiniTrend label="Match rating" values={apps.slice(-8).map(app=>app.rating)}/><MiniTrend label="OVR" values={player.snapshots.slice(-12).map(snapshot=>snapshot.overall)}/></div>
  </>
}

function Performance({state,requestedId,openMatch}:{state:AnalystState;requestedId?:string;openMatch:(matchId:string)=>void}) {
  const [tab,setTab]=useState<'matches'|'trends'>(requestedId?'matches':'trends')
  useEffect(()=>{if(requestedId)setTab('matches')},[requestedId])
  return <><PageTitle eyebrow="Analysis" title="Performance" note={`${state.career.teamName} · ${currentSeason(state)}`}/><div className="workspace-tabs segmented"><button className={tab==='matches'?'active':''} onClick={()=>setTab('matches')}>Matches</button><button className={tab==='trends'?'active':''} onClick={()=>setTab('trends')}>Trends</button></div>{tab==='matches'?<Matches state={state} requestedId={requestedId} embedded/>:<Trends state={state} openMatch={openMatch} embedded/>}</>
}

function Matches({ state, requestedId,embedded=false }: { state: AnalystState; requestedId?: string;embedded?:boolean }) {
  const [selectedId, setSelected] = useState(requestedId??state.matches[0]?.id)
  useEffect(()=>{if(requestedId)setSelected(requestedId)},[requestedId])
  const selected = state.matches.find(m => m.id === selectedId) ?? state.matches[0]
  return <>
    {!embedded&&<PageTitle eyebrow="Match room" title="Performance archive" note={`${state.matches.length} fixtures preserved`} />}
    <div className="match-workspace">
      <aside className="match-list">{state.matches.map(match => <button key={match.id} className={selected?.id === match.id ? 'active' : ''} onClick={() => setSelected(match.id)}><time>{date(match.date)}</time><span><b>{match.opponent}</b><small>{match.competition}</small></span><strong>{match.teamScore ?? '–'} : {match.opponentScore ?? '–'}</strong><em className={result(match)}>{result(match)}</em></button>)}</aside>
      <section className="match-detail">{selected ? <>
        <div className="scoreline"><div><p>{selected.venue || 'fixture'}</p><h2>{state.career.teamName}</h2></div><strong>{selected.teamScore ?? '–'}<i>:</i>{selected.opponentScore ?? '–'}</strong><div><p>{selected.competition}</p><h2>{selected.opponent}</h2></div></div>
        <SectionTitle title="Appearances" count={selected.appearances.length}/>
        <table><thead><tr><th>Player</th><th>Min</th><th>Pos</th><th>Rating</th><th>G</th><th>A</th></tr></thead><tbody>{selected.appearances.map(a => <tr key={a.id}><td><strong>{state.players.find(p => p.id === a.playerId)?.name || a.playerId}</strong></td><td>{a.minutes||'—'}</td><td>{a.position || '—'}</td><td className="metric">{a.rating ?? '—'}</td><td>{a.goals}</td><td>{a.assists}</td></tr>)}</tbody></table>
      </> : <Empty>A played or simulated match will appear after telemetry import.</Empty>}</section>
    </div>
  </>
}

function Trends({ state, openMatch,embedded=false }: { state: AnalystState; openMatch: (matchId: string) => void;embedded?:boolean }) {
  const [scope,setScope]=useState<'team'|'player'>('team')
  const [range,setRange]=useState<TrendRange>(10)
  const [competition,setCompetition]=useState('All')
  const [formation,setFormation]=useState('All')
  const season=currentSeason(state)
  const seasonMatches=filteredMatches(state,'all')
  const minuteLeader=state.players.map(player=>({player,minutes:seasonMatches.flatMap(match=>match.appearances).filter(app=>app.playerId===player.id).reduce((sum,app)=>sum+app.minutes,0)})).sort((a,b)=>b.minutes-a.minutes)[0]?.player
  const [playerId,setPlayerId]=useState(minuteLeader?.id??state.players[0]?.id??'')
  const [metric,setMetric]=useState('rating')
  const competitionMatches=filteredMatches(state,'all',competition)
  const allFiltered=competitionMatches.filter(match=>formation==='All'||match.formation===formation)
  const matches=range==='all'?allFiltered:allFiltered.slice(-range)
  const player=state.players.find(item=>item.id===playerId)??minuteLeader
  const availableMatchMetrics=PLAYER_METRICS.filter(([field])=>{
    const values=allFiltered.flatMap(match=>{const app=match.appearances.find(item=>item.playerId===player?.id);return app?[playerMetric(match,app,field)]:[]})
    return values.some(value=>value!==undefined)&&(!['saves','goalsConceded'].includes(field)||player?.positions.includes('GK')||values.some(value=>(value??0)>0))
  })
  const availableSnapshots=SNAPSHOT_METRICS.filter(([field])=>player?.snapshots.some(snapshot=>typeof snapshot[field]==='number'))
  const available=[...availableMatchMetrics,...availableSnapshots]
  useEffect(()=>{if(scope==='player'&&!available.some(([field])=>field===metric))setMetric(available[0]?.[0]??'rating')},[scope,playerId,competition,formation,state.matches.length])
  const teamSeries:TrendSeries[]=TEAM_METRICS.map(([field,label])=>matchSeries(matches,field,label,match=>teamMetric(match,field),'Telemetry'))
  const playerDefinition=available.find(([field])=>field===metric)
  const playerSeries=player&&playerDefinition ? (SNAPSHOT_METRICS.some(([field])=>field===metric)
    ? [snapshotSeries(player.snapshots,metric as keyof typeof player.snapshots[number],playerDefinition[1],range,season)]
    : [matchSeries(matches,metric,playerDefinition[1],match=>{const app=match.appearances.find(item=>item.playerId===player.id);return app?playerMetric(match,app,metric):undefined},'Telemetry')]) : []
  const competitions=[...new Set(seasonMatches.map(match=>match.competition).filter(Boolean))].sort()
  const formations=[...new Set(seasonMatches.map(match=>match.formation).filter(Boolean))].sort() as string[]
  return <>{!embedded&&<PageTitle eyebrow="Analysis" title="Current-season trends" note={`${state.career.teamName} · ${season}`} />}
    <section className="trend-workspace">
      <div className="trend-toolbar">
        <div className="segmented" aria-label="Trend scope">{(['team','player'] as const).map(value=><button key={value} className={scope===value?'active':''} onClick={()=>setScope(value)}>{value}</button>)}</div>
        <div className="segmented" aria-label="Match range">{([[5,'Last 5'],[10,'Last 10'],['all','All']] as const).map(([value,label])=><button key={value} className={range===value?'active':''} onClick={()=>setRange(value)}>{label}</button>)}</div>
        <label>Competition<select value={competition} onChange={event=>setCompetition(event.target.value)}><option>All</option>{competitions.map(value=><option key={value}>{value}</option>)}</select></label><label>Formation<select value={formation} onChange={event=>setFormation(event.target.value)}><option>All</option>{formations.map(value=><option key={value}>{value}</option>)}</select></label>
      </div>
      <div className="trend-selects">{scope==='team'?<span>Automatic match telemetry</span>:<><label>Player<select value={player?.id??''} onChange={event=>setPlayerId(event.target.value)}>{state.players.map(item=><option key={item.id} value={item.id}>{item.name}</option>)}</select></label><label>Metric<select value={metric} onChange={event=>setMetric(event.target.value)}>{available.map(([field,label])=><option key={field} value={field}>{label}</option>)}</select></label></>}</div>
      <p className="trend-note">{scope==='team'?`Goals for, goals against and goal difference across ${matches.length} current-season matches.`:`${player?.name??'No player'} · metrics with no source values are hidden.`} Click or press Enter on a match point to open it.</p>
      <TrendChart series={scope==='team'?teamSeries:playerSeries} onPoint={openMatch}/>
    </section>
  </>
}

function Tactics({ state, onState }: { state: AnalystState; onState: (state: AnalystState) => void }) {
  const tactic = activeTactic(state)
  if (!tactic) return <><PageTitle eyebrow="Game model" title="Tactical laboratory" note="Waiting for Live Editor"/><section className="lower-band"><Empty>No tactic export is available. The app will not invent a formation.</Empty></section></>
  return <TacticsEditor key={`${tactic.id}:${state.sync.lastImport??''}`} state={state} onState={onState} tactic={tactic}/>
}

function TacticsEditor({ state, onState, tactic }: { state: AnalystState; onState: (state: AnalystState) => void; tactic: Tactic }) {
  const [draft, setDraft] = useState(tactic)
  const [selectedId, setSelected] = useState(draft.slots[0]?.id)
  const slot = draft.slots.find(item => item.id === selectedId)
  const formationMatches=state.matches.filter(match=>match.seasonId===currentSeason(state)&&match.formation===draft.formation)
  const formationGoalDifference=formationMatches.map(match=>teamMetric(match,'goalDifference')).filter((value):value is number=>value!==undefined)
  const updateSlot = (change: Partial<TacticSlot>) => setDraft({...draft, slots: draft.slots.map(item => item.id === selectedId ? {...item,...change}:item)})
  const save = async () => onState(await window.fc26.updateTactic({...draft,corrected:true,slots:draft.slots.map(item=>({...item,focus:roleFocuses(item.position,item.role).includes(item.focus)?item.focus:roleFocuses(item.position,item.role)[0]}))}))
  return <><PageTitle eyebrow="Game model" title="Tactical laboratory" note={`${draft.formation} · edits are analyst scenarios only`} />
    <div className="tactics-layout"><section className="pitch-panel"><Pitch tactic={draft} state={state} selected={selectedId} onSelect={setSelected}/></section>
      <aside className="inspector"><p className="kicker">SELECTED SLOT</p><h2>{slot?.position || '—'}</h2>{slot && <>
        <label>Assigned player<select value={slot.playerId || ''} onChange={e => updateSlot({playerId:e.target.value || undefined})}><option value="">Unassigned</option>{state.players.map(p => <option value={p.id} key={p.id}>{p.name} · {p.overall}</option>)}</select></label>
        <label>Position<select value={slot.position} onChange={e => {const role=FC_ROLES[e.target.value][0];updateSlot({position:e.target.value,role,focus:roleFocuses(e.target.value,role)[0]})}}>{['GK','LB','CB','RB','CDM','CM','CAM','LM','RM','LW','RW','ST'].map(p => <option key={p}>{p}</option>)}</select></label>
        <label>Role<select value={slot.role} onChange={e => updateSlot({role:e.target.value,focus:roleFocuses(slot.position,e.target.value)[0]})}>{(FC_ROLES[slot.position] ?? [slot.role]).map(role => <option key={role}>{role}</option>)}</select></label>
        <label>Focus<select value={roleFocuses(slot.position,slot.role).includes(slot.focus)?slot.focus:roleFocuses(slot.position,slot.role)[0]} onChange={e => updateSlot({focus:e.target.value})}>{roleFocuses(slot.position,slot.role).map(f => <option key={f}>{f}</option>)}</select></label>
        <SectionTitle title="Role candidates"/>{state.players.map(player => {const role=roleFor(slot),apps=playerApps(state,player.id),supported=apps.filter(app=>app.rating!==undefined).length>=5&&apps.reduce((sum,app)=>sum+app.minutes,0)>=300;return {player,supported,score:role?positionAdjustedScore(player,slot.position,scorePlayer(player,role,apps)[supported?'total':'attributes']):Number.NEGATIVE_INFINITY}}).filter(item=>Number.isFinite(item.score)).sort((a,b)=>b.score-a.score).slice(0,5).map(({player,score,supported},index)=><Line key={player.id} left={`${index+1}. ${player.name}${supported?'':' · attributes only'}`} right={`${Math.round(score)}`}/>)}</>}
        <button className="primary save-tactic" onClick={save}>Save analyst scenario</button>
      </aside></div><section className="lower-band"><SectionTitle title="Formation evidence" count={formationMatches.length}/>{formationMatches.length?<><Line left="Current-season record" right={`${formationMatches.filter(match=>result(match)==='W').length}W · ${formationMatches.filter(match=>result(match)==='D').length}D · ${formationMatches.filter(match=>result(match)==='L').length}L`}/><Line left="Average goal difference" right={formationGoalDifference.length?displayValue(formationGoalDifference.reduce((sum,value)=>sum+value,0)/formationGoalDifference.length):'Not exposed'}/></>:<Line left="No imported match is linked to this formation yet" right="Waiting"/>}</section></>
}

function SquadDecisions({state}:{state:AnalystState}) {
  const tactic=activeTactic(state)
  if(!tactic)return <section className="lower-band"><SectionTitle title="Squad decisions"/><Empty>Import a tactic before the app evaluates squad coverage.</Empty></section>
  const matches=state.matches.filter(match=>match.seasonId===currentSeason(state))
  const depth=squadDepth(state.players,tactic.slots),baseShortfall=depth.reduce((sum,item)=>sum+item.shortfall,0)
  const starterEvidence=tactic.slots.flatMap(slot=>{const player=state.players.find(item=>item.id===slot.playerId),role=roleFor(slot);if(!player||!role)return[];const apps=playerApps(state,player.id),score=scorePlayer(player,role,apps);return[{player,slot,apps,score,minutes:apps.reduce((sum,app)=>sum+app.minutes,0)}]})
  const percentile=(values:number[])=>values.length?[...values].sort((a,b)=>a-b)[Math.floor((values.length-1)*.25)]:0
  const attributeFloor=percentile(starterEvidence.map(item=>item.score.attributes)),performanceFloor=percentile(starterEvidence.filter(item=>item.score.sampleSize>=5&&item.minutes>=300).map(item=>item.score.performance))
  const decisions=state.players.flatMap(player=>{
    if(player.injured||player.suspended)return[]
    const currentSlot=tactic.slots.find(slot=>slot.playerId===player.id)
    const eligible=tactic.slots.filter(slot=>player.positions.includes(slot.position))
    if(!eligible.length)return[{action:'Profile mismatch',title:player.name,reason:`None of the player’s imported positions (${player.positions.join(' / ')||'not exposed'}) exists in the current system. This is structural evidence, not a performance judgment.`}]
    const slot=currentSlot??eligible.map(slot=>({slot,score:scoreFor(state,player,slot)})).sort((a,b)=>b.score-a.score)[0].slot
    const role=roleFor(slot);if(!role)return[]
    const apps=playerApps(state,player.id),minutes=apps.reduce((sum,app)=>sum+app.minutes,0),score=scorePlayer(player,role,apps)
    const alternative=currentSlot?state.players.filter(candidate=>candidate.id!==player.id&&!candidate.injured&&!candidate.suspended).map(candidate=>({player:candidate,score:scoreFor(state,candidate,currentSlot)})).filter(item=>Number.isFinite(item.score)).sort((a,b)=>b.score-a.score)[0]:undefined
    const depthSafe=squadNeeds(state.players.filter(candidate=>candidate.id!==player.id),tactic.slots).reduce((sum,item)=>sum+item.shortfall,0)<=baseShortfall
    const action=playerDecision({starter:!!currentSlot,fitGap:score.attributes-attributeFloor,performance:score.performance,sample:score.sampleSize,minutes,alternativeGap:alternative?alternative.score-scoreFor(state,player,slot):0,depthSafe})
    const output:{action:string;title:string;reason:string}[]=[]
    if(action)output.push({action,title:player.name,reason:action==='Review sale'?`${score.sampleSize} rated appearances and ${minutes} minutes support a review; role attributes and recent ratings are weak relative to this squad, and natural-position depth remains covered.`:action==='Consider bench'?`Recent ratings are ${score.performance}/100 across ${score.sampleSize} matches and ${minutes} minutes${alternative?`; ${alternative.player.name} is the strongest eligible alternative.`:'.'}`:`${alternative?.player.name} is at least five role-fit points ahead after the evidence gate.`})
    const blockers=state.players.filter(candidate=>candidate.id!==player.id&&candidate.overall>player.overall&&candidate.positions.some(position=>player.positions.includes(position))).length
    if(matches.length>=10&&(player.age??99)<=21&&player.potential!==undefined&&player.potential-player.overall>=4&&minutes<matches.length*18&&blockers>=2&&depthSafe)output.push({action:'Loan pathway',title:player.name,reason:`Only ${minutes} minutes from ${matches.length} team matches, with ${blockers} stronger natural-position options blocking a player who still has development headroom.`})
    return output
  })
  for(const item of starterEvidence) if(item.score.sampleSize>=5&&item.minutes>=300&&item.score.attributes<=attributeFloor&&item.score.performance<=performanceFloor) {
    const alternative=state.players.filter(player=>player.id!==item.player.id).map(player=>scoreFor(state,player,item.slot)).filter(Number.isFinite).sort((a,b)=>b-a)[0]
    if(alternative===undefined||alternative<item.score.total+5)decisions.push({action:'Scout profile',title:`${item.slot.position} · ${item.slot.role}`,reason:`This is a bottom-quartile starting slot for both role attributes and supported recent performance, with no internal alternative five points better.`})
  }
  return <><section className="lower-band"><SectionTitle title="Evidence briefings" count={decisions.length}/><p className="muted">Selection advice requires 5 rated appearances and 300 minutes. Sale review requires 10 and 600, plus safe depth. Missing evidence never counts as poor evidence.</p>{decisions.length?<div className="decision-list">{decisions.slice(0,10).map((item,index)=><article key={`${item.action}:${item.title}:${index}`}><strong>{item.action}</strong><div><h3>{item.title}</h3><p>{item.reason}</p></div></article>)}</div>:<Line left="No supported selection, pathway or upgrade concern" right={matches.length<5?'Learning':'Stable'} tone="good"/>}</section><section className="lower-band"><SectionTitle title="Depth plan" count={depth.filter(item=>item.shortfall>0).length}/><p className="muted">Each positional unit needs unique starters and one distinct rotation player; goalkeeper needs a backup and third choice. Secondary positions are emergency cover, not another role requirement.</p><div className="needs-list">{depth.map(item=><article key={item.code}><span>{item.code}</span><div><h3>{item.label}</h3><p>{item.depth}/{item.targetDepth} natural options · Rotation: {item.rotation?.name??'Missing'} · Emergency cover: {item.cover?.name??'None'}{item.coverConflict?' (also covers another unit)':''}</p></div><strong className={item.shortfall?'warn':'good'}>{item.shortfall?`${item.shortfall} short`:'Ready'}</strong></article>)}</div></section></>
}

function Opponent({state}:{state:AnalystState}) {
  const opponent=state.opponent
  if(!opponent)return <><PageTitle eyebrow="Match preparation" title="Opponent" note="Waiting for the next fixture"/><section className="lower-band"><Empty>The opponent briefing appears after Live Editor exports the next scheduled fixture.</Empty></section><section className="lower-band"><SectionTitle title="Data coverage"/><SourceHealth state={state}/></section></>
  const summaries=opponent.players.map(player=>{
    const exact=player.statistics.filter(stat=>opponent.competitionId&&stat.competitionId===opponent.competitionId)
    const rows=exact.length?exact:player.statistics
    const appearances=rows.reduce((sum,stat)=>sum+stat.appearances,0)
    const rated=rows.filter(stat=>stat.averageRating!==undefined)
    const ratingAppearances=rated.reduce((sum,stat)=>sum+stat.appearances,0)
    const ratingWeight=rated.reduce((sum,stat)=>sum+stat.averageRating!*stat.appearances,0)
    return {player,scope:exact.length?(opponent.competition||'Upcoming competition'):'All competitions',appearances,averageRating:ratingAppearances?ratingWeight/ratingAppearances:undefined,goals:rows.reduce((sum,stat)=>sum+stat.goals,0),assists:rows.reduce((sum,stat)=>sum+stat.assists,0),cleanSheets:rows.reduce((sum,stat)=>sum+stat.cleanSheets,0)}
  }).sort((a,b)=>b.appearances-a.appearances||b.goals-a.goals)
  const watch=[...summaries].sort((a,b)=>(b.goals+b.assists)-(a.goals+a.assists)||b.appearances-a.appearances).slice(0,5)
  const unavailable=opponent.players.filter(player=>player.injured||player.suspended)
  return <><PageTitle eyebrow="Match preparation" title={opponent.teamName} note={`${date(opponent.date)} · ${opponent.competition||'Competition pending'}`}/><div className="opponent-summary"><section><SectionTitle title="Briefing limits"/><p>Public roster and recorded season totals only. This page does not expose hidden OVR, potential or attributes, and it does not predict pressing, build-up or a starting XI.</p></section><section><SectionTitle title="Exposed context"/><DataGrid values={[["Default shape",opponent.formation],["Roster",opponent.players.length],["Unavailable",unavailable.length],["Captured",date(opponent.capturedAt)]]}/></section></div><section className="lower-band"><SectionTitle title="Players to watch" count={watch.length}/><div className="watch-grid">{watch.map(item=><article key={item.player.id}><span>{item.player.positions[0]||'—'}</span><h3>{item.player.name}</h3><strong>{item.goals} G · {item.assists} A</strong><small>{item.appearances} apps · {item.averageRating?`${item.averageRating.toFixed(2)} avg`:'rating not exposed'} · {item.scope}</small></article>)}</div></section><section className="lower-band"><SectionTitle title="Probable squad" count={summaries.length}/><table><thead><tr><th>Player</th><th>Positions</th><th>Apps</th><th>Avg</th><th>Goals</th><th>Assists</th><th>Status</th></tr></thead><tbody>{summaries.map(item=><tr key={item.player.id}><td><strong>{item.player.name}</strong><small>#{item.player.number??'—'} · {item.player.age??'—'} yrs</small></td><td>{item.player.positions.join(' / ')||'Not exposed'}</td><td>{item.appearances}</td><td>{item.averageRating?.toFixed(2)??'—'}</td><td>{item.goals}</td><td>{item.assists}</td><td>{item.player.injured?'Injured':item.player.suspended?'Suspended':'Available'}</td></tr>)}</tbody></table></section></>
}

function SourceHealth({state}:{state:AnalystState}) {
  const sources=state.sync.sources??{}
  const labels:Record<string,string>={telemetry:'Match telemetry',squad:'Managed squad',tactics:'Tactics',fixtures:'Fixtures',opponent:'Next opponent'}
  return <div className="source-grid">{(['telemetry','squad','tactics','fixtures','opponent'] as const).map(name=>{const source=sources[name];return <div key={name} className={source?.status??'missing'}><span>{labels[name]}</span><strong>{source?.status==='ready'?`${source.rows} rows`:source?.status??'missing'}</strong><small>{source?.message??(source?.capturedAt?`Updated ${date(source.capturedAt)}`:'Waiting for export')}</small></div>})}</div>
}

function ScoreEvidence({ score }: { score: RoleScore }) {
  const missing=(name:string)=>score.missingEvidence.some(item=>item.startsWith(name))
  const rows=[
    ['Role attributes',70,score.attributes,missing('role attributes')?'Current OVR used because detailed attributes are unavailable':'Imported FC attributes weighted for this exact role',true],
    ['Recent ratings',30,score.performance,`Last ${score.sampleSize} current-season rating${score.sampleSize===1?'':'s'}, minutes-weighted when minutes are known`,score.sampleSize>0],
  ] as const
  const used=rows.filter(row=>row[4]),weight=used.reduce((sum,row)=>sum+row[1],0)
  return <div className="evidence"><p className="evidence-summary"><strong>{used.length===1?'Attributes-only estimate':'Current evidence used'}</strong>This is an analyst estimate, not an FC hidden rating. Missing sources are excluded, never counted as zero.</p>{used.map(([label,rowWeight,value,detail])=><div key={label}><span>{label} · {Math.round(rowWeight/weight*100)}% of this score</span><Meter value={value}/><small>{detail}</small></div>)}{!score.sampleSize&&<div className="evidence-waiting"><span>Waiting for match evidence</span><p>Selection advice needs 5 rated appearances and 300 minutes; this attribute estimate is not a performance judgment.</p></div>}</div>
}
function PageTitle({ eyebrow,title,note }: { eyebrow:string;title:string;note:string }) { return <header className="page-title"><div><p>{eyebrow}</p><h1>{title}</h1></div><span>{note}</span></header> }
function SectionTitle({ title,count,action,onAction }: { title:string;count?:number;action?:string;onAction?:()=>void }) { return <div className="section-title"><h3>{title}{count !== undefined && <sup>{count}</sup>}</h3>{action && <button onClick={onAction}>{action} →</button>}</div> }
function Line({ left,right,tone }: { left:string;right:string;tone?:string }) { return <div className={`line ${tone||''}`}><span>{left}</span><strong>{right}</strong></div> }
function DataGrid({values}:{values:[string,unknown][]}) { return <div className="data-grid">{values.map(([label,value])=><div key={label}><span>{label}</span><strong>{value === undefined ? 'Not exposed' : String(value)}</strong></div>)}</div> }
function MatchRows({matches}:{matches:Match[]}) { return <div className="match-rows">{matches.map(match=><div key={match.id}><time>{date(match.date)}</time><strong className={result(match)}>{result(match)}</strong><span>{match.opponent}</span><b>{match.teamScore ?? '–'} : {match.opponentScore ?? '–'}</b></div>)}</div> }

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
  const openMatch=(matchId:string)=>{setSelectedMatchId(matchId);setView('Performance')}
  useEffect(()=>{void window.fc26.getState().then(setState);return window.fc26.onStateChanged(setState)},[])
  if(!state) return <div className="boot"><i/>Loading career intelligence…</div>
  return <div className="app-shell"><aside className="sidebar"><div className="brand"><span>FC</span><div><b>CAREER</b><small>ANALYST / 26</small></div></div><nav>{views.map(item=><button key={item.name} className={view===item.name?'active':''} onClick={()=>setView(item.name)}><span>{item.key}</span>{item.name}</button>)}</nav><div className="side-footer"><div className={`sync-dot ${state.sync.status}`}/><span><b>{state.sync.status}</b><small>{state.sync.message}</small></span><button title="Settings" onClick={()=>setSettings(true)}>⚙</button></div></aside>
    <main>{view==='Overview'&&<Overview state={state} setView={setView}/>} {view==='Performance'&&<Performance state={state} requestedId={selectedMatchId} openMatch={openMatch}/>} {view==='Squad'&&<Squad state={state}/>} {view==='Tactics'&&<Tactics state={state} onState={setState}/>} {view==='Opponent'&&<Opponent state={state}/>}</main>
    {settings&&<Settings state={state} close={()=>setSettings(false)} onState={setState}/>}</div>
}
