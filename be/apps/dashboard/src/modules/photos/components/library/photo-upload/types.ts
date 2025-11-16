import type {
  PhotoSyncLogLevel,
  PhotoSyncProgressStage,
  PhotoSyncResultSummary,
  PhotoSyncStageTotals,
} from '../../../types'

export type FileUploadStatus = 'pending' | 'uploading' | 'uploaded' | 'processing' | 'done' | 'error'

export type FileProgressEntry = {
  index: number
  name: string
  size: number
  status: FileUploadStatus
  uploadedBytes: number
  progress: number
}

export type WorkflowPhase = 'review' | 'uploading' | 'processing' | 'completed' | 'error'

export type ProcessingStageState = {
  status: 'pending' | 'running' | 'completed'
  processed: number
  total: number
}

export type ProcessingLatestLog = {
  message: string
  level: PhotoSyncLogLevel
  timestamp: number
}

export type ProcessingLogEntry = ProcessingLatestLog & { id: string }

export type ProcessingState = {
  dryRun: boolean
  summary: PhotoSyncResultSummary
  totals: PhotoSyncStageTotals
  stages: Record<PhotoSyncProgressStage, ProcessingStageState>
  completed: boolean
  latestLog?: ProcessingLatestLog
  error?: string
}
