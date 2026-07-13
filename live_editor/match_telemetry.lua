require 'imports/career_mode/enums'
require 'imports/other/helpers'

-- Auto-runs with Live Editor; one row per player appearance is appended after every user match.
local OUTPUT_FILE = string.format('%s\\FC26 Career Analyst\\Live Editor\\fc26_match_telemetry.csv', os.getenv('APPDATA'))
local SCHEMA_VERSION = 3

local baseline
local baseline_date
local managed_team_id
local pending_completion_event
local pending_fixture
local pending_tactic

local counters = {
    'app', 'goals', 'assists', 'yellow', 'two_yellow', 'red',
    'motm', 'clean_sheets', 'saves', 'goals_conceded'
}

local function number(value)
    return tonumber(value) or 0
end

local function difference(before, after)
    local result = {}
    before = before or {}
    for _, field in ipairs(counters) do
        result[field] = number(after[field]) - number(before[field])
    end
    -- Live Editor stores the cumulative sum of match ratings multiplied by 10.
    result.rating = (number(after.avg) - number(before.avg)) / 10
    return result
end

-- Small self-check: this fails immediately if the telemetry maths is edited incorrectly.
do
    local result = difference(
        { app = 4, goals = 1, assists = 2, avg = 286 },
        { app = 5, goals = 3, assists = 2, avg = 364 }
    )
    assert(result.app == 1 and result.goals == 2 and result.assists == 0 and result.rating == 7.8)
end

local function csv(value)
    value = tostring(value or ''):gsub('"', '""')
    return '"' .. value .. '"'
end

local function value(row, field)
    local item = row and row[field]
    if type(item) == 'table' then return item.value end
    return item
end

local function get_managed_team_id()
    if managed_team_id then return managed_team_id end

    local ok, users = pcall(GetDBTableRows, 'career_users')
    if not ok then return nil end
    if not (users and users[1] and users[1].clubteamid) then return nil end
    managed_team_id = number(users[1].clubteamid.value)
    if managed_team_id <= 0 then managed_team_id = nil end
    return managed_team_id
end

local function career_id()
    local user = (GetDBTableRows('career_users') or {})[1] or {}
    local calendar = (GetDBTableRows('career_calendar') or {})[1] or {}
    local user_id = number(value(user, 'userid'))
    local start_date = number(value(calendar, 'startdate'))
    if start_date == 0 then start_date = number(value(calendar, 'setupdate')) end
    -- ponytail: team fallback only when this Live Editor build hides save identity fields; add manual profiles if identical-team saves collide.
    if user_id == 0 or start_date == 0 then return string.format('team-%d', get_managed_team_id() or 0) end
    return string.format('manager-%d-start-%d', user_id, start_date)
end

local function take_snapshot()
    local result = {}
    local team_id = get_managed_team_id()
    if not team_id then return nil end

    for _, stat in ipairs(GetPlayersStats()) do
        if number(stat.teamid) == team_id then
            local key = string.format('%d:%d', number(stat.playerid), number(stat.compobjid))
            result[key] = stat
        end
    end
    return result
end

local function find_fixture()
    local team_id = get_managed_team_id()
    local date = GetCurrentDate():ToInt()
    local best
    for _, row in ipairs(GetDBTableRows('fixtures') or {}) do
        local home_id = number(value(row, 'hometeamid'))
        local away_id = number(value(row, 'awayteamid'))
        if number(value(row, 'fixturedate')) == date and (home_id == team_id or away_id == team_id) then
            best = {
                fixture_id = number(value(row, 'fixtureid')),
                competition_id = number(value(row, 'competitionid')),
                home = home_id == team_id,
                opponent_id = home_id == team_id and away_id or home_id
            }
            break
        end
    end
    return best or { fixture_id = 0, competition_id = 0, home = false, opponent_id = 0 }
end

local function take_tactic_snapshot()
    local team_id = get_managed_team_id()
    local assigned = {}
    for _, link in ipairs(GetDBTableRows('teamplayerlinks') or {}) do
        if number(value(link, 'teamid')) == team_id then assigned[number(value(link, 'position'))] = number(value(link, 'playerid')) end
    end
    local formations = GetDBTableRows('customformations') or {}
    if #formations == 0 then formations = GetDBTableRows('formations') or {} end
    for _, formation in ipairs(formations) do
        if number(value(formation, 'teamid')) == team_id then
            local result = { id = number(value(formation, 'formationid')), name = value(formation, 'formationname') or '', roles = {} }
            for slot = 0, 10 do
                local player_id = assigned[number(value(formation, 'position' .. slot))]
                if player_id then result.roles[player_id] = number(value(formation, 'pos' .. slot .. 'role')) end
            end
            return result
        end
    end
    return { id = 0, name = '', roles = {} }
end

local function last_match_rows()
    local rows = {}
    for _, row in ipairs(GetDBTableRows('career_playerlastmatchhistory') or {}) do
        local player_id = number(value(row, 'playerid'))
        if player_id > 0 then rows[player_id] = row end
    end
    return rows
end

local headers = {
    'schema_version', 'career_id', 'match_id', 'fixture_id', 'captured_at', 'career_date', 'completion_event',
    'team_id', 'opponent_id', 'opponent', 'home_away', 'team_score', 'opponent_score', 'formation_id', 'formation_name',
    'competition_id', 'competition', 'player_id', 'player', 'minutes', 'played_position',
    'lineup_status', 'lineup_status_source', 'current_ovr', 'planned_role_code', 'appearance', 'rating', 'goals', 'assists', 'yellow_cards',
    'second_yellows', 'red_cards', 'motm', 'clean_sheets', 'saves',
    'goals_conceded'
}

local function open_output()
    local existing = io.open(OUTPUT_FILE, 'r')
    local needs_header = not existing
    if existing then
        local current_header = existing:read('*l')
        existing:close()
        if current_header ~= table.concat(headers, ',') then
            os.rename(OUTPUT_FILE, OUTPUT_FILE .. '.legacy-' .. os.time() .. '.csv')
            needs_header = true
        end
    end

    local file, err = io.open(OUTPUT_FILE, 'a')
    assert(file, string.format('Could not open %s: %s', OUTPUT_FILE, tostring(err)))
    if needs_header then file:write(table.concat(headers, ',') .. '\n') end
    return file
end

local function career_date()
    local date = GetCurrentDate()
    return string.format('%04d-%02d-%02d', date.year, date.month, date.day)
end

local function write_match(event_id)
    if not baseline then
        LOGGER:LogError('Match telemetry has no pre-match snapshot; load this script before entering the next match.')
        return false
    end

    local current = take_snapshot()
    if not current then return false end
    local file
    local date = baseline_date or career_date()
    local captured_at = os.date('!%Y-%m-%dT%H:%M:%SZ')
    local fixture = pending_fixture or find_fixture()
    local tactic = pending_tactic or take_tactic_snapshot()
    local profile_id = career_id()
    local match_id = fixture.fixture_id > 0 and string.format('fixture-%d', fixture.fixture_id)
        or string.format('%s-team-%d-comp-%d', date, get_managed_team_id(), fixture.competition_id)
    local history = last_match_rows()
    local team_score = 0
    local opponent_score = 0
    local rows = 0

    for key, after in pairs(current) do
        local delta = difference(baseline[key], after)
        if delta.app > 0 then
            team_score = team_score + delta.goals
            if delta.goals_conceded > opponent_score then opponent_score = delta.goals_conceded end
        end
    end

    for key, after in pairs(current) do
        local delta = difference(baseline[key], after)
        if delta.app > 0 then
            file = file or open_output()
            local competition_id = fixture.competition_id > 0 and fixture.competition_id or number(after.compobjid)
            local player_id = number(after.playerid)
            local last = history[player_id]
            local minutes = number(value(last, 'minsplayed'))
            local played_position = number(value(last, 'position'))
            local lineup_status = minutes > 45 and 'starter' or 'substitute'
            local row = {
                SCHEMA_VERSION, csv(profile_id), csv(match_id), fixture.fixture_id, csv(captured_at), csv(date), event_id,
                get_managed_team_id(), fixture.opponent_id, csv(fixture.opponent_id > 0 and GetTeamName(fixture.opponent_id) or ''),
                csv(fixture.home and 'home' or 'away'), team_score, opponent_score, tactic.id, csv(tactic.name),
                competition_id, csv(GetCompetitionNameByObjID(competition_id)),
                player_id, csv(GetPlayerName(player_id)), minutes, played_position,
                csv(lineup_status), csv('inferred_from_minutes'), number(value(last, 'playeroverall')), tactic.roles[player_id] or csv(''),
                delta.app, string.format('%.1f', delta.rating), delta.goals, delta.assists,
                delta.yellow, delta.two_yellow, delta.red, delta.motm,
                delta.clean_sheets, delta.saves, delta.goals_conceded
            }
            file:write(table.concat(row, ',') .. '\n')
            rows = rows + 1
        end
    end

    if not file then return false end

    file:close()
    baseline = current
    LOGGER:LogInfo(string.format('Match telemetry wrote %d player rows to %s', rows, OUTPUT_FILE))
    return true
end

local function before_match(_, event_id)
    if event_id == ENUM_CM_EVENT_MSG_ABOUT_TO_ENTER_PREMATCH then
        if pending_completion_event then
            if not write_match(pending_completion_event) then return end
            pending_completion_event = nil
        end
        local snapshot = take_snapshot()
        if not snapshot then return end
        baseline = snapshot
        baseline_date = career_date()
        pending_fixture = find_fixture()
        pending_tactic = take_tactic_snapshot()
        LOGGER:LogInfo('Match telemetry captured the pre-match snapshot.')
    end
end

local function after_match(_, event_id)
    if event_id == ENUM_CM_EVENT_MSG_USER_MATCH_COMPLETED
        or event_id == ENUM_CM_EVENT_MSG_USER_MATCH_COMPLETED_IN_TOURNAMENT
        or event_id == ENUM_CM_EVENT_MSG_USER_INTERNATIONAL_MATCH_COMPLETED then
        if not pending_completion_event then
            pending_completion_event = event_id
            LOGGER:LogInfo('Match completed; telemetry is waiting for FC 26 to update season statistics.')
        end
        return
    end

    -- Completion is emitted before FC 26 updates season totals, especially on quick sim.
    -- Retry on later career events and persist only after at least one appearance changes.
    if pending_completion_event and write_match(pending_completion_event) then
        pending_completion_event = nil
        pending_fixture = nil
        pending_tactic = nil
    end
end

local armed = false
local function arm()
    if armed or not IsInCM() then return end
    local snapshot = take_snapshot()
    if not snapshot then return end
    baseline = snapshot
    baseline_date = career_date()
    armed = true
    LOGGER:LogInfo(string.format('Match telemetry armed for team %d. Output: %s', get_managed_team_id(), OUTPUT_FILE))
end

local function handle_before(...)
    local _, event_id = ...
    if event_id ~= ENUM_CM_EVENT_MSG_ABOUT_TO_ENTER_PREMATCH then return end
    arm()
    if armed then before_match(...) end
end

local function handle_after(...)
    arm()
    if armed then after_match(...) end
end

local function safe(label, callback, ...)
    local ok, error = pcall(callback, ...)
    if not ok then LOGGER:LogError(label .. ' deferred: ' .. tostring(error)) end
end

local function before_match_autorun(...) safe('Match telemetry pre-event', handle_before, ...) end
local function after_match_autorun(...) safe('Match telemetry post-event', handle_after, ...) end

AddEventHandler('pre__CareerModeEvent', before_match_autorun)
AddEventHandler('post__CareerModeEvent', after_match_autorun)
