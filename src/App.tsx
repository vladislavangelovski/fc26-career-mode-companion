import { useEffect, useMemo, useState } from 'react'
import { assignUniqueXI, ROLE_LIBRARY, scorePlayer } from './shared/scoring'
import type { AnalystState, Match, OCRValue, Player, RoleDefinition, RoleScore, Tactic, TacticSlot } from './shared/types'

type View = 'Overview' | 'Squad' | 'Matches' | 'Tactics' | 'Recommendations'
const views: { name: View; key: string }[] = [{ name: 'Overview', key: '01' }, { name: 'Squad', key: '02' }, { name: 'Matches', key: '03' }, { name: 'Tactics', key: '04' }, { name: 'Recommendations', key: '05' }]
const fallbackPositions = [
  ['GK',50,91],['LB',17,71],['CB',39,76],['CB',61,76],['RB',83,71],['CM',30,48],['CM',50,58],['CM',70,48],['LW',20,22],['ST',50,14],['RW',80,22],
] as const

const date = (value?: string) => value ? new Intl.DateTimeFormat('en-GB', { day: '2-digit', month: 'short' }).format(new Date(value)) : '—'
const result = (match: Match) => match.teamScore === undefined || match.opponentScore === undefined ? '—' : match.teamScore > match.opponentScore ? 'W' : match.teamScore < match.opponentScore ? 'L' : 'D'
const roleFor = (slot: TacticSlot) => ROLE_LIBRARY.find(role => role.id === slot.role || role.name === slot.role) ?? ROLE_LIBRARY.find(role => role.eligiblePositions.includes(slot.position)) ?? ROLE_LIBRARY[ROLE_LIBRARY.length - 1]
const playerApps = (state: AnalystState, id: string) => state.matches.flatMap(match => match.appearances).filter(app => app.playerId === id)

function scoreFor(state: AnalystState, player: Player, slot: TacticSlot) {
  const eligible = player.positions.includes(slot.position) || roleFor(slot).eligiblePositions.some(pos => player.positions.includes(pos))
  return eligible ? scorePlayer(player, roleFor(slot), playerApps(state, player.id)).total : Math.max(0, scorePlayer(player, roleFor(slot), playerApps(state, player.id)).total - 24)
}

function activeTactic(state: AnalystState): Tactic {
  if (state.tactics[0]) return state.tactics[0]
  return { id: 'default', name: 'Working shape', formation: '4–3–3', corrected: false, instructions: {}, slots: fallbackPositions.map(([position, x, y], index) => ({ id: `default:${index}`, position, x, y, role: ROLE_LIBRARY.find(r => r.eligiblePositions.includes(position))?.id ?? 'playmaker', focus: 'Balanced', playerId: state.players[index]?.id, imported: false })) }
}

function Pitch({ tactic, state, selected, onSelect, assignments }: { tactic: Tactic; state: AnalystState; selected?: string; onSelect?: (id: string) => void; assignments?: Map<string, string> }) {
  return <div className="pitch" aria-label={`${tactic.formation} tactical pitch`}>
    <div className="pitch-markings"><i/><i/><i/></div>
    {tactic.slots.map((slot, index) => {
      const playerId = assignments?.get(slot.id) ?? slot.playerId
      const player = state.players.find(item => item.id === playerId)
      const fallback = fallbackPositions[index]
      const x = slot.x > 100 || slot.x < 0 ? fallback?.[1] ?? 50 : slot.x
      const y = slot.y > 100 || slot.y < 0 ? fallback?.[2] ?? 50 : slot.y
      return <button key={slot.id} className={`pitch-player ${selected === slot.id ? 'selected' : ''}`} style={{ left: `${x}%`, top: `${y}%` }} onClick={() => onSelect?.(slot.id)}>
        <span>{player?.number || slot.position}</span><b>{player?.name?.split(' ').at(-1) || slot.position}</b><small>{roleFor(slot).name}</small>
      </button>
    })}
  </div>
}

function Meter({ value }: { value: number }) { return <span className="meter"><i style={{ width: `${Math.max(0, Math.min(100, value))}%` }}/><b>{Math.round(value)}</b></span> }
function Empty({ children }: { children: string }) { return <div className="empty"><span>⌁</span>{children}</div> }

function Overview({ state, setView }: { state: AnalystState; setView: (view: View) => void }) {
  const tactic = activeTactic(state)
  const recent = state.matches.slice(0, 5)
  const unavailable = state.players.filter(p => p.injured || p.suspended)
  const warnings = tactic.slots.map(slot => ({ slot, top: Math.max(...state.players.map(p => scoreFor(state, p, slot)), 0) })).filter(item => item.top < 70)
  return <>
    <PageTitle eyebrow="Command centre" title={state.career.teamName} note={`${state.career.season} · ${tactic.formation}`} />
    <div className="overview-grid">
      <section className="pitch-panel"><SectionTitle title="Active system" action="Edit tactics" onAction={() => setView('Tactics')} /><Pitch tactic={tactic} state={state}/></section>
      <aside className="overview-rail">
        <section><SectionTitle title="Last five"/><div className="form-strip">{recent.length ? recent.map(match => <span key={match.id} className={result(match)}>{result(match)}</span>) : <em>NO MATCHES</em>}</div></section>
        <section><SectionTitle title="Availability" count={unavailable.length}/>{unavailable.length ? unavailable.map(p => <Line key={p.id} left={p.name} right={p.injured ? 'Injured' : 'Suspended'} tone="warn"/>) : <Line left="Full squad available" right="Clear" tone="good"/>}</section>
        <section><SectionTitle title="Role warnings" count={warnings.length}/>{warnings.length ? warnings.slice(0, 4).map(({ slot, top }) => <Line key={slot.id} left={`${slot.position} · ${roleFor(slot).name}`} right={`${Math.round(top)} fit`} tone="warn"/>) : <Line left="Starting roles covered" right="≥ 70" tone="good"/>}</section>
      </aside>
    </div>
    <section className="lower-band"><SectionTitle title="Recent matches" action="Open match room" onAction={() => setView('Matches')}/>{recent.length ? <MatchRows matches={recent}/> : <Empty>Run the telemetry script before a match to begin the timeline.</Empty>}</section>
  </>
}

function Squad({ state }: { state: AnalystState }) {
  const [selectedId, setSelected] = useState(state.players[0]?.id)
  const [sort, setSort] = useState<'name'|'overall'|'age'>('overall')
  const players = [...state.players].sort((a,b) => sort === 'name' ? a.name.localeCompare(b.name) : (b[sort] ?? 0) - (a[sort] ?? 0))
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
  const apps = playerApps(state, player.id)
  const best = ROLE_LIBRARY.map(role => scorePlayer(player, role, apps)).sort((a,b) => b.total-a.total)[0]
  return <><p className="kicker">PLAYER DOSSIER</p><h2>{player.name}</h2><p className="muted">{player.positions.join(' · ')} · OVR {player.overall}</p>
    <div className="hero-number"><span>{player.overall}</span><small>CURRENT OVR</small></div>
    <SectionTitle title="Best role fit"/><Line left={ROLE_LIBRARY.find(r => r.id === best?.roleId)?.name || 'Awaiting evidence'} right={best ? `${best.total}` : '—'} tone="good"/>
    {best && <ScoreEvidence score={best}/>}<SectionTitle title="Condition"/>
    <DataGrid values={[['Fitness',player.fitness],['Sharpness',player.sharpness],['Morale',player.morale],['Form',player.form]]}/>
    <SectionTitle title="Development & contract"/><DataGrid values={[['Potential',player.potential],['Age',player.age],['Wage',player.wage ? player.wage.toLocaleString() : undefined],['Contract',player.contractEnd]]}/>
    <SectionTitle title="Performance trend"/><div className="ratings">{apps.slice(-8).map(a => <span key={a.id} style={{ height: `${(a.rating ?? 5) * 10}%` }} title={`${a.rating}`}/>)}</div>
  </>
}

function Matches({ state, onState }: { state: AnalystState; onState: (state: AnalystState) => void }) {
  const [selectedId, setSelected] = useState(state.matches[0]?.id)
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

function Tactics({ state, onState }: { state: AnalystState; onState: (state: AnalystState) => void }) {
  const [draft, setDraft] = useState(activeTactic(state))
  const [selectedId, setSelected] = useState(draft.slots[0]?.id)
  const slot = draft.slots.find(item => item.id === selectedId)
  const updateSlot = (change: Partial<TacticSlot>) => setDraft({...draft, slots: draft.slots.map(item => item.id === selectedId ? {...item,...change}:item)})
  const save = async () => onState(await window.fc26.updateTactic({...draft, corrected:true}))
  return <><PageTitle eyebrow="Game model" title="Tactical laboratory" note={`${draft.formation} · imported values remain editable`} />
    <div className="tactics-layout"><section className="pitch-panel"><Pitch tactic={draft} state={state} selected={selectedId} onSelect={setSelected}/></section>
      <aside className="inspector"><p className="kicker">SELECTED SLOT</p><h2>{slot?.position || '—'}</h2>{slot && <>
        <label>Assigned player<select value={slot.playerId || ''} onChange={e => updateSlot({playerId:e.target.value || undefined})}><option value="">Unassigned</option>{state.players.map(p => <option value={p.id} key={p.id}>{p.name} · {p.overall}</option>)}</select></label>
        <label>Position<select value={slot.position} onChange={e => updateSlot({position:e.target.value})}>{['GK','LB','CB','RB','LWB','RWB','CDM','CM','CAM','LM','RM','LW','RW','CF','ST'].map(p => <option key={p}>{p}</option>)}</select></label>
        <label>Role<select value={slot.role} onChange={e => updateSlot({role:e.target.value})}>{ROLE_LIBRARY.map(role => <option value={role.id} key={role.id}>{role.name}</option>)}</select></label>
        <label>Focus<select value={slot.focus} onChange={e => updateSlot({focus:e.target.value})}>{['Balanced','Defend','Support','Build-Up','Attack','Versatile'].map(f => <option key={f}>{f}</option>)}</select></label>
        <label>X position<input type="range" min="8" max="92" value={slot.x} onChange={e => updateSlot({x:Number(e.target.value)})}/></label><label>Y position<input type="range" min="8" max="92" value={slot.y} onChange={e => updateSlot({y:Number(e.target.value)})}/></label>
        <SectionTitle title="Ranked candidates"/>{state.players.map(player => ({player,score:scoreFor(state,player,slot)})).sort((a,b)=>b.score-a.score).slice(0,5).map(({player,score},index)=><Line key={player.id} left={`${index+1}. ${player.name}`} right={`${Math.round(score)}`}/>)}</>}
        <button className="primary save-tactic" onClick={save}>Save tactical corrections</button>
      </aside></div></>
}

function Recommendations({ state }: { state: AnalystState }) {
  const tactic = activeTactic(state)
  const xi = assignUniqueXI(state.players, tactic.slots, (player,slot) => scoreFor(state,player,slot))
  const assignment = new Map(xi.map(item => [item.slotId,item.playerId]))
  const needs = tactic.slots.map(slot => { const ranked = state.players.map(player => ({player, score:scoreFor(state,player,slot)})).sort((a,b)=>b.score-a.score); return {slot,starter:ranked[0],backup:ranked[1]} }).filter(item => (item.starter?.score ?? 0)<70 || (item.backup?.score ?? 0)<65 || item.starter?.player.age && item.starter.player.age! >= 32)
  const [selected, setSelected] = useState(xi[0]?.slotId)
  const selectedAssignment = xi.find(item => item.slotId === selected)
  const selectedSlot = tactic.slots.find(slot => slot.id === selected)
  const selectedPlayer = state.players.find(player => player.id === selectedAssignment?.playerId)
  const evidence = selectedPlayer && selectedSlot ? scorePlayer(selectedPlayer, roleFor(selectedSlot), playerApps(state,selectedPlayer.id)) : undefined
  return <><PageTitle eyebrow="Decision room" title="Squad recommendations" note="Traceable role fit · unique-player assignment"/>
    <div className="recommend-layout"><section className="pitch-panel"><SectionTitle title="Strongest available XI"/><Pitch tactic={tactic} state={state} assignments={assignment} selected={selected} onSelect={setSelected}/></section>
      <aside className="inspector"><p className="kicker">SELECTION EVIDENCE</p>{selectedPlayer && selectedSlot && evidence ? <><h2>{selectedPlayer.name}</h2><p className="muted">{roleFor(selectedSlot).name} · {evidence.confidence} confidence</p><div className="hero-number"><span>{evidence.total}</span><small>ROLE FIT / 100</small></div><ScoreEvidence score={evidence}/></> : <Empty>Import squad data to generate the XI.</Empty>}</aside></div>
    <section className="lower-band"><SectionTitle title="Priority squad needs" count={needs.length}/>{needs.length ? <div className="needs-list">{needs.map(({slot,starter,backup}) => <article key={slot.id}><span>{slot.position}</span><div><h3>{roleFor(slot).name}</h3><p>{(starter?.score ?? 0)<70 ? `Best starter is ${Math.round(starter?.score ?? 0)}; target is 70.` : `Starter covered by ${starter.player.name}.`} {(backup?.score ?? 0)<65 ? `Depth reaches only ${Math.round(backup?.score ?? 0)}.` : 'Backup threshold is covered.'}</p></div><strong>{Math.round(starter?.score ?? 0)}</strong></article>)}</div> : <Line left="No threshold failures in the current system" right="Covered" tone="good"/>}</section>
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
  const [settings,setSettings]=useState(false)
  useEffect(()=>{void window.fc26.getState().then(setState);return window.fc26.onStateChanged(setState)},[])
  if(!state) return <div className="boot"><i/>Loading career intelligence…</div>
  return <div className="app-shell"><aside className="sidebar"><div className="brand"><span>FC</span><div><b>CAREER</b><small>ANALYST / 26</small></div></div><nav>{views.map(item=><button key={item.name} className={view===item.name?'active':''} onClick={()=>setView(item.name)}><span>{item.key}</span>{item.name}</button>)}</nav><div className="side-footer"><div className={`sync-dot ${state.sync.status}`}/><span><b>{state.sync.status}</b><small>{state.sync.message}</small></span><button title="Settings" onClick={()=>setSettings(true)}>⚙</button></div></aside>
    <main>{view==='Overview'&&<Overview state={state} setView={setView}/>} {view==='Squad'&&<Squad state={state}/>} {view==='Matches'&&<Matches state={state} onState={setState}/>} {view==='Tactics'&&<Tactics state={state} onState={setState}/>} {view==='Recommendations'&&<Recommendations state={state}/>}</main>
    {settings&&<Settings state={state} close={()=>setSettings(false)} onState={setState}/>}</div>
}
