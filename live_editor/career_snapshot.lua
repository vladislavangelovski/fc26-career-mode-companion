require 'imports/career_mode/enums'
require 'imports/other/helpers'

-- Auto-runs after a Career save loads and refreshes on day changes and before matches.
-- This script only reads FC 26 data and overwrites the two snapshot files.
local SCHEMA_VERSION = 2
local EXPORT_DIR = string.format('%s\\FC26 Career Analyst\\Live Editor', os.getenv('APPDATA'))
local SQUAD_FILE = EXPORT_DIR .. '\\fc26_squad_snapshot.csv'
local TACTICS_FILE = EXPORT_DIR .. '\\fc26_tactics_snapshot.csv'
local FIXTURES_FILE = EXPORT_DIR .. '\\fc26_fixtures_snapshot.csv'

local function number(v) return tonumber(v) or 0 end
local function value(row, field)
    local item = row and row[field]
    if type(item) == 'table' then return item.value end
    return item
end
local function csv(v)
    v = tostring(v or ''):gsub('"', '""')
    return '"' .. v .. '"'
end
local function index(table_name, key, filter)
    local result = {}
    for _, row in ipairs(GetDBTableRows(table_name) or {}) do
        if not filter or filter(row) then result[number(value(row, key))] = row end
    end
    return result
end
local function write_csv(path, headers, rows)
    local file, err = io.open(path, 'w+')
    assert(file, string.format('Could not open %s: %s', path, tostring(err)))
    file:write(table.concat(headers, ',') .. '\n')
    for _, row in ipairs(rows) do file:write(table.concat(row, ',') .. '\n') end
    file:close()
end
local function career_id(team_id)
    local user = (GetDBTableRows('career_users') or {})[1] or {}
    local calendar = (GetDBTableRows('career_calendar') or {})[1] or {}
    local user_id = number(value(user, 'userid'))
    local start_date = number(value(calendar, 'startdate'))
    if start_date == 0 then start_date = number(value(calendar, 'setupdate')) end
    -- ponytail: team fallback only when this Live Editor build hides save identity fields; add manual profiles if identical-team saves collide.
    if user_id == 0 or start_date == 0 then return string.format('team-%d', team_id) end
    return string.format('manager-%d-start-%d', user_id, start_date)
end

local function export_snapshot()
local team_id = GetUserTeamID()
assert(team_id > 0, 'Managed team ID is invalid')
local links = index('teamplayerlinks', 'playerid', function(row) return number(value(row, 'teamid')) == team_id end)
local contracts = index('career_playercontract', 'playerid', function(row) return number(value(row, 'teamid')) == team_id end)
local players = index('players', 'playerid')
local date = GetCurrentDate()
local captured_at = os.date('!%Y-%m-%dT%H:%M:%SZ')
local profile_id = career_id(team_id)

local attributes = {
    'overallrating','potential','acceleration','sprintspeed','finishing','shotpower','longshots','positioning',
    'volleys','penalties','vision','crossing','freekickaccuracy','shortpassing','longpassing','curve',
    'agility','balance','reactions','ballcontrol','dribbling','composure','interceptions','headingaccuracy',
    'defensiveawareness','standingtackle','slidingtackle','jumping','stamina','strength','aggression',
    'gkdiving','gkhandling','gkkicking','gkreflexes','gkpositioning'
}
local squad_headers = {
    'schema_version','career_id','captured_at','career_date','team_id','team','player_id','player','age','jersey_number',
    'position','preferred_position_1','preferred_position_2','preferred_position_3','preferred_position_4',
    'preferred_position_5','preferred_position_6','preferred_position_7','overall','potential','injury','suspension',
    'form','morale','fitness','sharpness','contract_end','contract_months','wage','squad_role',
    'playstyle_trait_1','playstyle_trait_2','role_1','role_2','role_3','role_4','role_5'
}
for _, attribute in ipairs(attributes) do table.insert(squad_headers, attribute) end

local squad_rows = {}
for player_id, link in pairs(links) do
    local player = players[player_id] or {}
    local contract = contracts[player_id] or {}
    local birth = DATE:new()
    birth:FromGregorianDays(number(value(player, 'birthdate')))
    local row = {
        SCHEMA_VERSION, csv(profile_id), csv(captured_at), csv(string.format('%04d-%02d-%02d', date.year, date.month, date.day)),
        team_id, csv(GetTeamName(team_id)), player_id, csv(GetPlayerName(player_id)), CalculatePlayerAge(date, birth),
        number(value(link, 'jerseynumber')), number(value(link, 'position')),
        number(value(player, 'preferredposition1')), number(value(player, 'preferredposition2')), number(value(player, 'preferredposition3')),
        number(value(player, 'preferredposition4')), number(value(player, 'preferredposition5')), number(value(player, 'preferredposition6')),
        number(value(player, 'preferredposition7')), number(value(player, 'overallrating')), number(value(player, 'potential')),
        number(value(link, 'injury')), csv(''), number(value(link, 'form')),
        csv(''), csv(''), csv(''), number(value(player, 'contractvaliduntil')), number(value(contract, 'duration_months')),
        number(value(contract, 'wage')), number(value(contract, 'playerrole')), number(value(player, 'trait1')),
        number(value(player, 'trait2')), number(value(player, 'role1')), number(value(player, 'role2')),
        number(value(player, 'role3')), number(value(player, 'role4')), number(value(player, 'role5'))
    }
    for _, attribute in ipairs(attributes) do table.insert(row, number(value(player, attribute))) end
    table.insert(squad_rows, row)
end
table.sort(squad_rows, function(a, b) return number(a[7]) < number(b[7]) end)
write_csv(SQUAD_FILE, squad_headers, squad_rows)

local fixture_headers = {'schema_version','career_id','fixture_id','career_date','team_id','opponent_id','opponent','home_away','competition_id','competition'}
local fixture_rows = {}
for _, fixture in ipairs(GetDBTableRows('fixtures') or {}) do
    local home_id = number(value(fixture, 'hometeamid'))
    local away_id = number(value(fixture, 'awayteamid'))
    if home_id == team_id or away_id == team_id then
        local opponent_id = home_id == team_id and away_id or home_id
        local competition_id = number(value(fixture, 'competitionid'))
        local fixture_date = DATE:new()
        fixture_date:FromGregorianDays(number(value(fixture, 'fixturedate')))
        table.insert(fixture_rows, {
            SCHEMA_VERSION, csv(profile_id), number(value(fixture, 'fixtureid')),
            csv(string.format('%04d-%02d-%02d', fixture_date.year, fixture_date.month, fixture_date.day)),
            team_id, opponent_id, csv(GetTeamName(opponent_id)), csv(home_id == team_id and 'home' or 'away'),
            competition_id, csv(GetCompetitionNameByObjID(competition_id))
        })
    end
end
write_csv(FIXTURES_FILE, fixture_headers, fixture_rows)

local tactic_headers = {
    'schema_version','career_id','captured_at','team_id','formation_id','formation_name','slot','position','x','y','role','focus',
    'assigned_player_id','build_up_speed','build_up_passing','build_up_dribbling','chance_passing','chance_crossing',
    'chance_shooting','defensive_pressure','defensive_width','defensive_line'
}
local tactic_rows = {}
local assigned_players = {}
for player_id, link in pairs(links) do
    local position = number(value(link, 'position'))
    if position >= 0 and position < 28 then assigned_players[position] = player_id end
end
local formations = GetDBTableRows('customformations') or {}
if #formations == 0 then formations = GetDBTableRows('formations') or {} end
for _, formation in ipairs(formations) do
    if number(value(formation, 'teamid')) == team_id then
        for slot = 0, 10 do
            local position = number(value(formation, 'position' .. slot))
            table.insert(tactic_rows, {
                SCHEMA_VERSION, csv(profile_id), csv(captured_at), team_id, number(value(formation, 'formationid')),
                csv(value(formation, 'formationname')), slot, position,
                number(value(formation, 'offset' .. slot .. 'x')), number(value(formation, 'offset' .. slot .. 'y')),
                number(value(formation, 'pos' .. slot .. 'role')), csv(''), assigned_players[position] or csv(''),
                csv(''), csv(''), csv(''), csv(''), csv(''), csv(''), csv(''), csv('')
            })
        end
    end
end
write_csv(TACTICS_FILE, tactic_headers, tactic_rows)
LOGGER:LogInfo(string.format('Career snapshot wrote %d players and %d tactic slots.', #squad_rows, #tactic_rows))
LOGGER:LogInfo('Snapshot outputs: ' .. SQUAD_FILE .. ' and ' .. TACTICS_FILE)
end

local function refresh_snapshot(_, event_id)
    if IsInCM() and (
        event_id == ENUM_CM_EVENT_MSG_POST_LOAD_PREPARE or
        event_id == ENUM_CM_EVENT_MSG_DAY_PASSED or
        event_id == ENUM_CM_EVENT_MSG_ABOUT_TO_ENTER_PREMATCH
    ) then
        export_snapshot()
    end
end

local function safe_refresh(...)
    local ok, error = pcall(refresh_snapshot, ...)
    if not ok then LOGGER:LogError('Career snapshot deferred: ' .. tostring(error)) end
end

AddEventHandler('post__CareerModeEvent', safe_refresh)
