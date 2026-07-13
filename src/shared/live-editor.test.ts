import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

describe('Live Editor autorun safety', () => {
  it('never touches career data from startup or unrelated pre-events', () => {
    const script = readFileSync('live_editor/match_telemetry.lua', 'utf8')
    const before = script.slice(script.indexOf('local function handle_before'), script.indexOf('local function handle_after'))
    expect(before.indexOf('event_id ~= ENUM_CM_EVENT_MSG_ABOUT_TO_ENTER_PREMATCH')).toBeLessThan(before.indexOf('arm()'))
    expect(script).toContain('pcall(callback, ...)')
    expect(script.trim().endsWith("AddEventHandler('post__CareerModeEvent', after_match_autorun)")).toBe(true)
  })
})
