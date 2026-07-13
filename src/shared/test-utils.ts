import type { AnalystState } from './types'
export const initialTestState = (): AnalystState => ({ schemaVersion:1,career:{teamName:'Test FC',season:'2025/26',createdAt:'2025-01-01'},players:[],matches:[],tactics:[],settings:{telemetryPath:'',squadPath:'',tacticsPath:''},sync:{status:'watching'} })
