import type { PhotoUploadProgressSnapshot } from '../../api'

export type PhotoUploadRequestOptions = {
  signal?: AbortSignal
  onUploadProgress?: (snapshot: PhotoUploadProgressSnapshot) => void
  directory?: string | null
  timeoutMs?: number
}
