import { createHash, randomUUID } from 'node:crypto'
import { copyFile, mkdir, readFile } from 'node:fs/promises'
import path from 'node:path'
import os from 'node:os'
import sharp from 'sharp'
import { createWorker, type Worker } from 'tesseract.js'
import type { Match, MatchScreenshot, OCRValue, ScreenshotImportResult } from '../src/shared/types'
import { classifyOCR, extractOCRValues } from '../src/shared/ocr'
import { CareerStore } from './store'

let worker: Worker | undefined
async function getWorker() {
  if (!worker) worker = await createWorker('eng', 1, {
    langPath: path.dirname(require.resolve('@tesseract.js-data/eng/4.0.0_best_int/eng.traineddata.gz')),
    cachePath: path.join(process.env.APPDATA || os.homedir(), 'FC26 Career Analyst', 'ocr-cache'),
  })
  return worker
}

function playerMatch(text: string, match: Match, store: CareerStore) {
  const participants = new Set(match.appearances.map(a => a.playerId))
  const normalize = (value: string) => value.toLowerCase().normalize('NFD').replace(/\p{Diacritic}/gu, '').replace(/[^\p{L}\p{N} ]/gu, ' ').replace(/\s+/g, ' ').trim()
  const distance = (a: string, b: string) => {
    const row = Array.from({ length: b.length + 1 }, (_, index) => index)
    for (let i = 1; i <= a.length; i++) { let previous = row[0]; row[0] = i; for (let j = 1; j <= b.length; j++) { const saved = row[j]; row[j] = Math.min(row[j] + 1, row[j - 1] + 1, previous + (a[i - 1] === b[j - 1] ? 0 : 1)); previous = saved } }
    return row[b.length]
  }
  const lines = text.split(/\r?\n/).map(normalize).filter(Boolean)
  const candidates = store.state.players.filter(player => participants.has(player.id)).map(player => {
    const name = normalize(player.name)
    const exact = lines.some(line => line.includes(name))
    const similarity = exact ? 1 : Math.max(...lines.map(line => 1 - distance(name, line.slice(0, Math.max(name.length, 1))) / Math.max(name.length, 1)), 0)
    return { player, similarity }
  }).sort((a, b) => b.similarity - a.similarity)
  return candidates[0]?.similarity >= .78 ? candidates[0].player : undefined
}

export async function importScreenshots(store: CareerStore, matchId: string, sources: string[], progress: (message: string) => void): Promise<ScreenshotImportResult> {
  const match = store.state.matches.find(item => item.id === matchId)
  if (!match) throw new Error('Match not found')
  const result: ScreenshotImportResult = { imported: 0, duplicates: 0, rejected: [] }
  const directory = path.join(store.screenshotDirectory, matchId.replace(/[^a-z0-9_.-]/gi, '_'))
  await mkdir(directory, { recursive: true })
  match.ocr = { status: 'processing', values: [] }

  for (const [index, source] of sources.entries()) {
    progress(`Reading screenshot ${index + 1} of ${sources.length}`)
    const input = await readFile(source)
    const hash = createHash('sha256').update(input).digest('hex')
    if (store.state.matches.some(item => item.screenshots.some(image => image.sha256 === hash))) { result.duplicates++; continue }
    const metadata = await sharp(input).metadata()
    if (metadata.width !== 2560 || metadata.height !== 1440) { result.rejected.push(`${path.basename(source)} is ${metadata.width}×${metadata.height}; expected 2560×1440`); continue }
    const id = randomUUID()
    const destination = path.join(directory, `${hash.slice(0, 12)}${path.extname(source).toLowerCase() || '.png'}`)
    await copyFile(source, destination)
    const header = await sharp(input).extract({ left: 120, top: 60, width: 2320, height: 300 }).grayscale().normalize().sharpen().resize({ width: 3200 }).png().toBuffer()
    const headerRecognition = await (await getWorker()).recognize(header)
    let screenType = classifyOCR(headerRecognition.data.text)
    const crop = screenType === 'player-detail' ? { left: 100, top: 120, width: 2360, height: 1220 } : { left: 160, top: 150, width: 2240, height: 1140 }
    const preprocessed = await sharp(input).extract(crop).grayscale().normalize().sharpen().resize({ width: 3200 }).png().toBuffer()
    const recognition = await (await getWorker()).recognize(preprocessed)
    if (screenType === 'unknown') screenType = classifyOCR(`${headerRecognition.data.text}\n${recognition.data.text}`)
    const player = screenType === 'player-detail' ? playerMatch(recognition.data.text, match, store) : undefined
    const screenshot: MatchScreenshot = { id, fileName: path.basename(source), path: destination, sha256: hash, screenType, width: 2560, height: 1440 }
    match.screenshots.push(screenshot)
    match.ocr.values.push(...extractOCRValues(recognition.data.text, recognition.data.confidence, id, player?.id, screenType === 'player-detail' ? 'player' : 'team'))
    result.imported++
  }
  match.captureLevel = result.imported ? 'played' : match.captureLevel
  match.ocr.status = result.imported ? 'review' : 'none'
  await store.save()
  return result
}

export async function confirmOCR(store: CareerStore, matchId: string, values: OCRValue[]) {
  const match = store.state.matches.find(item => item.id === matchId)
  if (!match) throw new Error('Match not found')
  match.ocr.values = values
  for (const value of values.filter(item => item.included)) {
    const numeric = Number(value.value)
    if (!Number.isFinite(numeric)) continue
    if (value.scope === 'player' && !value.playerId) continue
    if (value.playerId) {
      const appearance = match.appearances.find(item => item.playerId === value.playerId)
      if (!appearance) continue
      if (value.field === 'rating') appearance.rating = numeric
      else if (value.field === 'goals') appearance.goals = numeric
      else if (value.field === 'assists') appearance.assists = numeric
      else if (value.field === 'saves') appearance.saves = numeric
      else appearance.detailedMetrics[value.field] = numeric
    } else match.teamStatistics[value.field] = numeric
  }
  match.ocr.status = 'confirmed'
  return store.save()
}
