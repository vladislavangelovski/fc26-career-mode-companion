export function parseCSV(input: string): Record<string, string>[] {
  const rows: string[][] = []
  let row: string[] = []
  let field = ''
  let quoted = false
  for (let i = 0; i < input.length; i++) {
    const char = input[i]
    if (char === '"') {
      if (quoted && input[i + 1] === '"') { field += '"'; i++ } else quoted = !quoted
    } else if (char === ',' && !quoted) {
      row.push(field); field = ''
    } else if ((char === '\n' || char === '\r') && !quoted) {
      if (char === '\r' && input[i + 1] === '\n') i++
      row.push(field); field = ''
      if (row.some(Boolean)) rows.push(row)
      row = []
    } else field += char
  }
  if (field || row.length) { row.push(field); rows.push(row) }
  const [headers = [], ...data] = rows
  return data.map(values => Object.fromEntries(headers.map((header, index) => [header.trim(), values[index] ?? ''])))
}

export const n = (value: string | number | undefined, fallback = 0) => {
  if (value === undefined || value === '') return fallback
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : fallback
}
