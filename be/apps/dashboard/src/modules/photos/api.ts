import { coreApi, coreApiBaseURL } from '~/lib/api-client'
import { camelCaseKeys } from '~/lib/case'

import type {
  PhotoAssetListItem,
  PhotoAssetSummary,
  PhotoSyncAction,
  PhotoSyncConflict,
  PhotoSyncProgressEvent,
  PhotoSyncResolution,
  PhotoSyncResult,
  PhotoSyncStatus,
  RunPhotoSyncPayload,
} from './types'

const STABLE_NEWLINE = /\r?\n/

type RunPhotoSyncOptions = {
  signal?: AbortSignal
  onEvent?: (event: PhotoSyncProgressEvent) => void
}

export type PhotoUploadFileProgress = {
  index: number
  name: string
  size: number
  uploadedBytes: number
  progress: number
}

export type PhotoUploadProgressSnapshot = {
  totalBytes: number
  uploadedBytes: number
  files: PhotoUploadFileProgress[]
}

export type UploadPhotoAssetsOptions = {
  directory?: string
  signal?: AbortSignal
  onProgress?: (snapshot: PhotoUploadProgressSnapshot) => void
  timeoutMs?: number
}

export async function runPhotoSync(
  payload: RunPhotoSyncPayload,
  options?: RunPhotoSyncOptions,
): Promise<PhotoSyncResult> {
  const response = await fetch(`${coreApiBaseURL}/data-sync/run`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      accept: 'text/event-stream',
    },
    credentials: 'include',
    body: JSON.stringify({ dryRun: payload.dryRun ?? false }),
    signal: options?.signal,
  })

  if (!response.ok || !response.body) {
    const message = `同步请求失败：${response.status} ${response.statusText}`
    throw new Error(message)
  }

  const reader = response.body.getReader()
  const decoder = new TextDecoder('utf-8')
  let buffer = ''
  let finalResult: PhotoSyncResult | null = null
  let lastErrorMessage: string | null = null

  const stageEvent = (rawEvent: string) => {
    const lines = rawEvent.split(STABLE_NEWLINE)
    let eventName: string | null = null
    const dataLines: string[] = []

    for (const line of lines) {
      if (!line) {
        continue
      }

      if (line.startsWith(':')) {
        continue
      }

      if (line.startsWith('event:')) {
        eventName = line.slice(6).trim()
        continue
      }

      if (line.startsWith('data:')) {
        dataLines.push(line.slice(5).trim())
      }
    }

    if (!eventName || dataLines.length === 0) {
      return
    }

    if (eventName !== 'progress') {
      return
    }

    const data = dataLines.join('\n')

    try {
      const parsed = JSON.parse(data)
      const event = camelCaseKeys<PhotoSyncProgressEvent>(parsed)

      options?.onEvent?.(event)

      if (event.type === 'complete') {
        finalResult = event.payload
      }

      if (event.type === 'error') {
        lastErrorMessage = event.payload.message
      }
    } catch (error) {
      console.error('Failed to parse sync progress event', error)
    }
  }

  try {
    while (true) {
      const { value, done } = await reader.read()
      if (done) {
        break
      }

      buffer += decoder.decode(value, { stream: true })

      let boundary = buffer.indexOf('\n\n')
      while (boundary !== -1) {
        const rawEvent = buffer.slice(0, boundary)
        buffer = buffer.slice(boundary + 2)
        stageEvent(rawEvent)
        boundary = buffer.indexOf('\n\n')
      }
    }

    if (buffer.trim().length > 0) {
      stageEvent(buffer)
      buffer = ''
    }
  } finally {
    reader.releaseLock()
  }

  if (lastErrorMessage) {
    throw new Error(lastErrorMessage)
  }

  if (!finalResult) {
    throw new Error('同步过程中未收到最终结果，连接已终止。')
  }

  return camelCaseKeys<PhotoSyncResult>(finalResult)
}

export async function listPhotoSyncConflicts(): Promise<PhotoSyncConflict[]> {
  const conflicts = await coreApi<PhotoSyncConflict[]>('/data-sync/conflicts')
  return camelCaseKeys<PhotoSyncConflict[]>(conflicts)
}

export async function resolvePhotoSyncConflict(
  id: string,
  payload: { strategy: PhotoSyncResolution; dryRun?: boolean },
): Promise<PhotoSyncAction> {
  const result = await coreApi<PhotoSyncAction>(`/data-sync/conflicts/${id}/resolve`, {
    method: 'POST',
    body: payload,
  })

  return camelCaseKeys<PhotoSyncAction>(result)
}

export async function listPhotoAssets(): Promise<PhotoAssetListItem[]> {
  const assets = await coreApi<PhotoAssetListItem[]>('/photos/assets')

  return camelCaseKeys<PhotoAssetListItem[]>(assets)
}

export async function getPhotoAssetSummary(): Promise<PhotoAssetSummary> {
  const summary = await coreApi<PhotoAssetSummary>('/photos/assets/summary')

  return camelCaseKeys<PhotoAssetSummary>(summary)
}

export async function deletePhotoAssets(ids: string[], options?: { deleteFromStorage?: boolean }): Promise<void> {
  await coreApi('/photos/assets', {
    method: 'DELETE',
    body: {
      ids,
      deleteFromStorage: options?.deleteFromStorage === true,
    },
  })
}

export async function uploadPhotoAssets(
  files: File[],
  options?: UploadPhotoAssetsOptions,
): Promise<PhotoAssetListItem[]> {
  if (files.length === 0) {
    return []
  }

  const formData = new FormData()

  if (options?.directory) {
    formData.append('directory', options.directory)
  }

  for (const file of files) {
    formData.append('files', file)
  }

  if (typeof XMLHttpRequest === 'undefined') {
    const fallbackResponse = await coreApi<{ assets: PhotoAssetListItem[] }>('/photos/assets/upload', {
      method: 'POST',
      body: formData,
    })
    const fallbackData = camelCaseKeys<{ assets: PhotoAssetListItem[] }>(fallbackResponse)
    return fallbackData.assets
  }

  const fileMetadata = files.map((file, index) => ({
    index,
    name: file.name,
    size: file.size,
  }))
  const totalBytes = fileMetadata.reduce((sum, file) => sum + file.size, 0)

  const snapshotFromLoaded = (loaded: number): PhotoUploadProgressSnapshot => {
    let remaining = loaded
    const filesProgress: PhotoUploadFileProgress[] = fileMetadata.map((meta) => {
      const uploadedForFile = Math.max(0, Math.min(meta.size, remaining))
      remaining -= uploadedForFile
      return {
        index: meta.index,
        name: meta.name,
        size: meta.size,
        uploadedBytes: uploadedForFile,
        progress: meta.size === 0 ? 1 : Math.min(1, uploadedForFile / meta.size),
      }
    })

    return {
      totalBytes,
      uploadedBytes: Math.min(loaded, totalBytes),
      files: filesProgress,
    }
  }

  return await new Promise<PhotoAssetListItem[]>((resolve, reject) => {
    const xhr = new XMLHttpRequest()
    xhr.open('POST', `${coreApiBaseURL}/photos/assets/upload`, true)
    xhr.withCredentials = true
    xhr.responseType = 'json'
    if (options?.timeoutMs && Number.isFinite(options.timeoutMs)) {
      xhr.timeout = Math.max(0, options.timeoutMs)
    }

    const handleAbort = () => {
      xhr.abort()
    }

    const cleanup = () => {
      if (options?.signal) {
        options.signal.removeEventListener('abort', handleAbort)
      }
    }

    if (options?.signal) {
      if (options.signal.aborted) {
        cleanup()
        reject(new DOMException('Upload aborted', 'AbortError'))
        return
      }
      options.signal.addEventListener('abort', handleAbort)
    }

    xhr.upload.onprogress = (event: ProgressEvent<EventTarget>) => {
      if (!options?.onProgress) {
        return
      }
      const loaded = event.lengthComputable ? event.loaded : totalBytes
      options.onProgress(snapshotFromLoaded(loaded))
    }

    xhr.onerror = () => {
      cleanup()
      reject(new Error('上传过程中出现网络错误，请稍后再试。'))
    }

    xhr.onabort = () => {
      cleanup()
      reject(new DOMException('Upload aborted', 'AbortError'))
    }

    xhr.ontimeout = () => {
      cleanup()
      reject(new Error('上传超时，请稍后再试。'))
    }

    xhr.onload = () => {
      cleanup()
      if (xhr.status >= 200 && xhr.status < 300) {
        try {
          const rawResponse = typeof xhr.response === 'string' ? JSON.parse(xhr.response) : xhr.response
          const parsed = camelCaseKeys<{ assets: PhotoAssetListItem[] }>(rawResponse)
          resolve(parsed.assets)
        } catch (error) {
          reject(error instanceof Error ? error : new Error('无法解析上传响应'))
        }
        return
      }

      let message = `上传失败：${xhr.status}`
      const { responseText } = xhr
      if (responseText) {
        try {
          const parsed = JSON.parse(responseText)
          if (parsed && typeof parsed.message === 'string') {
            message = parsed.message
          }
        } catch {
          // ignore parse error
        }
      }
      reject(new Error(message))
    }

    xhr.send(formData)
  })
}

export async function getPhotoStorageUrl(storageKey: string): Promise<string> {
  const result = await coreApi<{ url: string }>('/photos/storage-url', {
    method: 'GET',
    query: { key: storageKey },
  })

  const data = camelCaseKeys<{ url: string }>(result)

  return data.url
}

export async function getPhotoSyncStatus(): Promise<PhotoSyncStatus> {
  const status = await coreApi<PhotoSyncStatus>('/data-sync/status')
  return camelCaseKeys<PhotoSyncStatus>(status)
}
