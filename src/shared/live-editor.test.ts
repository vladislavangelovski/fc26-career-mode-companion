import { existsSync, readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

describe('Live Editor autorun safety', () => {
  it('never touches career data from startup or unrelated pre-events', () => {
    const script = readFileSync('live_editor/match_telemetry.lua', 'utf8')
    const before = script.slice(script.indexOf('local function handle_before'), script.indexOf('local function handle_after'))
    expect(before.indexOf('event_id ~= ENUM_CM_EVENT_MSG_ABOUT_TO_ENTER_PREMATCH')).toBeLessThan(before.indexOf('arm()'))
    expect(script).toContain('pcall(callback, ...)')
    expect(script).toContain("'schema_version', 'career_id', 'match_id'")
    expect(script).toContain("'formation_id', 'formation_name'")
    expect(script).toContain("'planned_role_code'")
    expect(script).toContain("OUTPUT_FILE .. '.legacy-'")
    expect(script).toContain('MEMORY:ReadPointer(manager + 0x60)')
    expect(script).not.toContain("GetDBTableRows('fixtures')")
    expect(script.trim().endsWith("AddEventHandler('post__CareerModeEvent', after_match_autorun)")).toBe(true)
    const snapshot=readFileSync('live_editor/career_snapshot.lua','utf8')
    expect(snapshot).toContain('fc26_fixtures_snapshot.csv')
    expect(snapshot).toContain('fc26_opponent_snapshot.csv')
    expect(snapshot).not.toContain("OPPONENT_FILE = EXPORT_DIR .. '\\\\Desktop")
    expect(snapshot).toContain('raw_date > 0')
    expect(snapshot).toContain('MEMORY:ReadPointer(manager + 0x60)')
    expect(snapshot).not.toContain("GetDBTableRows('fixtures')")
    expect(snapshot).not.toContain('ENUM_CM_EVENT_MSG_DAY_PASSED')
    expect(readFileSync('electron/main.ts','utf8')).toContain('deployLiveEditorScripts')
    expect(JSON.parse(readFileSync('package.json','utf8')).build.extraResources).toEqual([{from:'live_editor',to:'live_editor'}])
  })
})

describe('mid-match resource throttling', () => {
  it('yields Electron resources while the analyst is unfocused', () => {
    const main=readFileSync('electron/main.ts','utf8')
    const importer=readFileSync('electron/importer.ts','utf8')
    expect(main).toContain('app.disableHardwareAcceleration()')
    expect(main).toContain('backgroundThrottling: true')
    expect(main).toContain('PRIORITY_BELOW_NORMAL')
    expect(main).toContain("window.on('blur', () => lowerAppPriority(true))")
    expect(main).toContain("window.on('focus', () => { lowerAppPriority(false); emit() })")
    expect(main).toContain("if (window?.isFocused()) window.webContents.send('career:changed', store.state)")
    expect(importer).toContain("if(window?.isFocused())window.webContents.send('career:changed', this.store.state)")
  })
})

describe('telemetry-only build', () => {
  it('does not ship OCR code or dependencies', () => {
    const packageJson=JSON.parse(readFileSync('package.json','utf8'))
    expect(existsSync('electron/ocr.ts')).toBe(false)
    expect(existsSync('src/shared/ocr.ts')).toBe(false)
    expect(packageJson.dependencies).toEqual({react:'^19.1.0','react-dom':'^19.1.0'})
    expect(packageJson.build.asarUnpack).toBeUndefined()
  })
})
