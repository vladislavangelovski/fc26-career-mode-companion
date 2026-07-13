import { describe, expect, it } from 'vitest'
import { parseCSV } from './csv'

describe('parseCSV', () => {
  it('parses quoted commas, escaped quotes and non-ASCII names', () => {
    const rows = parseCSV('player_id,player,club\r\n1,"João Félix","Milan, FC"\r\n2,"O""Brien",Town')
    expect(rows).toEqual([
      { player_id: '1', player: 'João Félix', club: 'Milan, FC' },
      { player_id: '2', player: 'O"Brien', club: 'Town' },
    ])
  })
})
