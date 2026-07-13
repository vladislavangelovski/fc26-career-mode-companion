export type Confidence = 'Basic' | 'Standard' | 'Strong'

export interface PlayerSnapshot {
  capturedAt: string
  careerDate?: string
  overall: number
  potential?: number
  form?: number
  morale?: number
  fitness?: number
  sharpness?: number
}

export interface Player {
  id: string
  name: string
  age?: number
  number?: number
  lineupPosition?: string
  positions: string[]
  overall: number
  potential?: number
  attributes: Record<string, number>
  familiarity: Record<string, number>
  injured: boolean
  suspended: boolean
  form?: number
  morale?: number
  fitness?: number
  sharpness?: number
  contractEnd?: string
  wage?: number
  snapshots: PlayerSnapshot[]
}

export interface Appearance {
  id: string
  matchId: string
  playerId: string
  minutes: number
  position?: string
  lineupStatus?: string
  lineupStatusSource?: string
  overall?: number
  rating?: number
  goals: number
  assists: number
  yellowCards: number
  redCards: number
  saves: number
  goalsConceded: number
  detailedMetrics: Record<string, number>
  telemetry?: { rating?: number; goals: number; assists: number; saves: number }
}

export interface OCRValue {
  id: string
  screenshotId: string
  playerId?: string
  scope: 'team' | 'player'
  unmatchedPlayer?: boolean
  field: string
  value: string | number
  confidence: number
  included: boolean
}

export interface MatchScreenshot {
  id: string
  fileName: string
  path: string
  sha256: string
  screenType: 'team-summary' | 'player-detail' | 'unknown'
  width: number
  height: number
}

export interface Match {
  id: string
  seasonId: string
  fixtureId?: string
  date: string
  competition: string
  opponent: string
  venue?: 'home' | 'away'
  teamScore?: number
  opponentScore?: number
  captureLevel: 'telemetry' | 'played'
  appearances: Appearance[]
  teamStatistics: Record<string, number>
  screenshots: MatchScreenshot[]
  ocr: { status: 'none' | 'processing' | 'review' | 'confirmed'; values: OCRValue[] }
}

export interface TacticSlot {
  id: string
  position: string
  x: number
  y: number
  role: string
  focus: string
  playerId?: string
  imported: boolean
}

export interface Tactic {
  id: string
  name: string
  formation: string
  slots: TacticSlot[]
  instructions: Record<string, string | number>
  corrected: boolean
}

export interface RoleDefinition {
  id: string
  name: string
  eligiblePositions: string[]
  attributeWeights: Record<string, number>
  performanceWeights: Record<string, number>
}

export interface RoleScore {
  playerId: string
  roleId: string
  total: number
  attributes: number
  performance: number
  condition: number
  familiarity: number
  sampleSize: number
  confidence: Confidence
  missingEvidence: string[]
  excluded?: string
}

export interface AnalystState {
  schemaVersion: number
  career: { teamId?: string; teamName: string; season: string; createdAt: string }
  players: Player[]
  matches: Match[]
  tactics: Tactic[]
  settings: { telemetryPath: string; squadPath: string; tacticsPath: string }
  sync: { status: 'watching' | 'importing' | 'error'; lastImport?: string; message?: string }
}

export interface ScreenshotImportResult { imported: number; duplicates: number; rejected: string[] }

export interface DesktopAPI {
  getState(): Promise<AnalystState>
  updateSettings(settings: AnalystState['settings']): Promise<AnalystState>
  importNow(): Promise<AnalystState>
  importScreenshots(matchId: string): Promise<ScreenshotImportResult>
  confirmOCR(matchId: string, values: OCRValue[]): Promise<AnalystState>
  updateTactic(tactic: Tactic): Promise<AnalystState>
  backup(): Promise<string | null>
  restore(): Promise<AnalystState | null>
  onStateChanged(callback: (state: AnalystState) => void): () => void
}
