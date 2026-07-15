import { describe, expect, it } from 'vitest'
import { initialTestState } from './test-utils'
import { careerProfileId, formationName, mergeFixtures, mergeTelemetry, positionName, roleFocuses, rowsForCareer, tacticRoleFocus } from './telemetry'

describe('telemetry merge', () => {
  it('recognizes the exported 4-1-2-1-2 wide shape', () => {
    expect(formationName(['0','3','4','6','7','10','12','16','18','24','26'])).toBe('4-1-2-1-2 Wide')
  })

  it('decodes FC 26 positions, roles, and focuses without generic fallbacks', () => {
    expect(['4','5','6'].map(positionName)).toEqual(['CB','CB','CB'])
    expect(['28','29','-1'].map(positionName)).toEqual(['','',''])
    const roles: [string,number,number,string][] = [
      ['GK',1,1,'Goalkeeper'],['GK',1,2,'Sweeper Keeper'],['GK',1,27,'Ball-Playing Keeper'],
      ['RB',2,3,'Fullback'],['RB',2,5,'Falseback'],['RB',2,4,'Wingback'],['RB',2,6,'Attacking Wingback'],['RB',2,28,'Inverted Wingback'],
      ['CB',3,7,'Defender'],['CB',3,8,'Stopper'],['CB',3,9,'Ball-Playing Defender'],['CB',3,29,'Wide Back'],
      ['CDM',4,11,'Holding'],['CDM',4,10,'Centre Half'],['CDM',4,12,'Deep-Lying Playmaker'],['CDM',4,13,'Wide Half'],['CDM',4,30,'Box Crasher'],
      ['CM',5,14,'Box-to-Box'],['CM',5,11,'Holding'],['CM',5,12,'Deep-Lying Playmaker'],['CM',5,20,'Playmaker'],['CM',5,15,'Half-Winger'],
      ['RM',6,16,'Winger'],['RM',6,18,'Wide Midfielder'],['RM',6,17,'Wide Playmaker'],['RM',6,19,'Inside Forward'],
      ['CAM',7,20,'Playmaker'],['CAM',7,25,'Shadow Striker'],['CAM',7,15,'Half-Winger'],['CAM',7,26,'Classic 10'],
      ['RW',8,16,'Winger'],['RW',8,19,'Inside Forward'],['RW',8,17,'Wide Playmaker'],
      ['ST',9,24,'Advanced Forward'],['ST',9,23,'Poacher'],['ST',9,22,'False 9'],['ST',9,21,'Target Forward'],
    ]
    const focusCodes: Record<string,number> = {'Defend':1,'Balanced':2,'Build-Up':3,'Support':4,'Attack':5,'Roaming':6,'Ball-Winning':7,'Aggressive':8,'Wide':9,'Versatile':10}
    let combinations=0
    for (const [position,group,roleId,role] of roles) for (const focus of roleFocuses(position,role)) {
      const code=(group << 12) | (roleId << 6) | focusCodes[focus]
      expect(tacticRoleFocus(String(code)), `${position} ${role} / ${focus}`).toEqual([role,focus])
      combinations++
    }
    expect(roles).toHaveLength(37)
    expect(combinations).toBe(85)
    expect(tacticRoleFocus('99999')).toBeUndefined()
  })

  it('keeps rows from different careers isolated', () => {
    const rows=[{career_id:'career-a',team_id:'1'},{career_id:'career-b',team_id:'1'},{team_id:'2'}]
    expect(careerProfileId(rows[0])).toBe('career-a')
    expect(rowsForCareer(rows,'career-a')).toEqual([rows[0]])
    expect(rowsForCareer(rows,'team-2')).toEqual([rows[2]])
  })

  it('uses match_id + player_id idempotently and accepts delayed rows', () => {
    const state = initialTestState()
    const first = { match_id:'fixture-40',fixture_id:'40',career_date:'2025-07-29',competition:'Cup',opponent:'Málaga',home_away:'home',formation_id:'12',formation_name:'4-1-2-1-2',planned_role_code:'30346',team_score:'2',opponent_score:'1',player_id:'7',player:'João Félix',minutes:'90',played_position:'18',rating:'7.7',goals:'1',assists:'0',yellow_cards:'0',red_cards:'0',second_yellows:'0',saves:'0',goals_conceded:'0',current_ovr:'84' }
    mergeTelemetry(state, [first]); mergeTelemetry(state, [first])
    expect(state.matches).toHaveLength(1)
    expect(state.matches[0]).toMatchObject({tacticId:'12',formation:'4-1-2-1-2'})
    expect(state.matches[0].appearances[0]).toMatchObject({plannedRole:'Classic 10',plannedFocus:'Versatile'})
    expect(state.matches[0].appearances).toHaveLength(1)
    state.matches[0].appearances[0].detailedMetrics.passAccuracy = 92
    mergeTelemetry(state, [{...first,player_id:'9',player:'O\'Brien',minutes:'24'}])
    expect(state.matches[0].appearances).toHaveLength(2)
    mergeTelemetry(state, [first])
    expect(state.matches[0].appearances[0].detailedMetrics.passAccuracy).toBe(92)
  })

  it('repairs a legacy opponent from the fixture snapshot', () => {
    const state=initialTestState();state.matches=[{id:'legacy',seasonId:'2025/26',date:'2025-07-29',competition:'Cup',opponent:'Opponent not exposed',captureLevel:'telemetry',appearances:[],teamStatistics:{},opponentStatistics:{},screenshots:[],ocr:{status:'none',values:[]}}]
    mergeFixtures(state,[{fixture_id:'40',career_date:'2025-07-29',competition:'Cup',opponent:'Málaga',home_away:'away'}])
    expect(state.matches[0]).toMatchObject({fixtureId:'40',opponent:'Málaga',venue:'away'})
  })
  it('refreshes delayed match facts and never invents 90 minutes', () => {
    const state=initialTestState()
    const base={match_id:'m1',career_date:'2025-08-01',player_id:'1',player:'Keeper',played_position:'0',goals:'0',assists:'0',yellow_cards:'0',red_cards:'0',second_yellows:'0',saves:'3',goals_conceded:'1',rating:'7'}
    mergeTelemetry(state,[base])
    expect(state.matches[0].appearances[0].minutes).toBe(0)
    mergeTelemetry(state,[{...base,fixture_id:'99',opponent:'Fiorentina',competition:'League',home_away:'home',team_score:'2',opponent_score:'1',minutes:'90'}])
    expect(state.matches[0]).toMatchObject({fixtureId:'99',opponent:'Fiorentina',competition:'League',venue:'home',teamScore:2,opponentScore:1})
    expect(state.matches[0].appearances[0].minutes).toBe(90)
  })
})
