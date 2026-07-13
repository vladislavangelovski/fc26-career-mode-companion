-- Run in a loaded Career Mode save and send the generated file back for analysis.
local OUTPUT_FILE = string.format('%s\\Desktop\\fc26_telemetry_schema.txt', os.getenv('USERPROFILE'))
local keywords = {
    'match', 'stat', 'rating', 'minute', 'shot', 'goal', 'assist', 'pass',
    'tackle', 'interception', 'possession', 'expected', 'fixture', 'lineup'
}

local function relevant(value)
    value = string.lower(tostring(value or ''))
    for _, keyword in ipairs(keywords) do
        if string.find(value, keyword, 1, true) then return true end
    end
    return false
end

assert(relevant('career_playermatchratinghistory') and not relevant('players'))
assert(IsInCM(), 'Load a Career Mode save before running this probe')

local file, err = io.open(OUTPUT_FILE, 'w')
assert(file, string.format('Could not open %s: %s', OUTPUT_FILE, tostring(err)))

for _, table_name in ipairs(GetDBTablesNames()) do
    local fields = GetDBTableFields(table_name)
    local matched_fields = {}
    for _, field in ipairs(fields) do
        if relevant(field.name) then table.insert(matched_fields, field.name) end
    end

    if relevant(table_name) or #matched_fields > 0 then
        local all_fields = {}
        for _, field in ipairs(fields) do table.insert(all_fields, field.name) end
        file:write(string.format('[%s]\nmatched=%s\nfields=%s\n\n',
            table_name, table.concat(matched_fields, ','), table.concat(all_fields, ',')))
    end
end

file:close()
LOGGER:LogInfo(string.format('Telemetry schema written to %s', OUTPUT_FILE))
MessageBox('Telemetry discovery complete', OUTPUT_FILE)
