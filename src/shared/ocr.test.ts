import { describe, expect, it } from 'vitest'
import { classifyOCR, extractOCRValues } from './ocr'

describe('OCR template parsing', () => {
  it('classifies known screens and extracts review values', () => {
    expect(classifyOCR('MATCH FACTS\nPossession 54%\nShots 12')).toBe('team-summary')
    expect(classifyOCR('PLAYER PERFORMANCE\nDistance covered 11.2')).toBe('player-detail')
    expect(classifyOCR('PLAYER PERFORMANCE\nShots 4')).toBe('player-detail')
    expect(extractOCRValues('Rating 7,8\nPass accuracy 92%',87,'shot-1','p1')).toMatchObject([
      {field:'rating',value:7.8,confidence:87,playerId:'p1'},
      {field:'passAccuracy',value:92,confidence:87,playerId:'p1'},
    ])
    expect(extractOCRValues('Rating 6.4',72,'shot-2',undefined,'player')[0]).toMatchObject({scope:'player',unmatchedPlayer:true,included:false})
  })
})
