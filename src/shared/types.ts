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
  contractMonths?: number
  wage?: number
  snapshots: PlayerSnapshot[]
}

export interface Appearance {
  id: string
  matchId: string
  playerId: string
  minutes: number
  position?: string
  plannedRole?: string
  plannedFocus?: string
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
}

export interface Match {
  id: string
  seasonId: string
  fixtureId?: string
  date: string
  competition: string
  opponent: string
  venue?: 'home' | 'away'
  tacticId?: string
  formation?: string
  teamScore?: number
  opponentScore?: number
  appearances: Appearance[]
}

export interface OpponentPlayerStatistics {
  competitionId?: string
  competition: string
  appearances: number
  averageRating?: number
  goals: number
  assists: number
  yellowCards: number
  redCards: number
  cleanSheets: number
  saves: number
  goalsConceded: number
}

export interface OpponentPlayer {
  id: string
  name: string
  age?: number
  number?: number
  positions: string[]
  lineupPosition?: string
  injured: boolean
  suspended: boolean
  statistics: OpponentPlayerStatistics[]
}

export interface OpponentSnapshot {
  capturedAt: string
  fixtureId?: string
  teamId: string
  teamName: string
  date?: string
  competitionId?: string
  competition?: string
  formation?: string
  players: OpponentPlayer[]
}

export type SourceName = 'telemetry' | 'squad' | 'tactics' | 'fixtures' | 'opponent'
export interface SourceStatus { status: 'ready' | 'missing' | 'error'; rows: number; capturedAt?: string; message?: string }

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
  career: { profileId?: string; teamId?: string; teamName: string; season: string; createdAt: string }
  players: Player[]
  matches: Match[]
  tactics: Tactic[]
  opponent?: OpponentSnapshot
  settings: { telemetryPath: string; squadPath: string; tacticsPath: string }
  sync: { status: 'watching' | 'importing' | 'error'; lastImport?: string; message?: string; sources?: Partial<Record<SourceName, SourceStatus>> }
}

export interface DesktopAPI {
  getState(): Promise<AnalystState>
  updateSettings(settings: AnalystState['settings']): Promise<AnalystState>
  importNow(): Promise<AnalystState>
  updateTactic(tactic: Tactic): Promise<AnalystState>
  backup(): Promise<string | null>
  restore(): Promise<AnalystState | null>
  onStateChanged(callback: (state: AnalystState) => void): () => void
}
