import type { ReactNode } from 'react'
import { createContext, use, useEffect, useMemo } from 'react'
import type { StoreApi } from 'zustand'
import { useStore } from 'zustand'
import { createStore } from 'zustand/vanilla'

import { runPhotoSync } from '../../../api'
import type { PhotoSyncProgressEvent } from '../../../types'
import type { PhotoUploadRequestOptions } from '../upload.types'
import type { FileProgressEntry, ProcessingLogEntry, ProcessingState, WorkflowPhase } from './types'
import {
  calculateTotalSize,
  calculateUploadedBytes,
  collectUnmatchedMovFiles,
  createFileEntries,
  createFileList,
  createStageStateFromTotals,
  deriveDirectoryFromTags,
  getErrorMessage,
} from './utils'

type PhotoUploadStoreState = {
  files: File[]
  totalSize: number
  uploadedBytes: number
  availableTags: string[]
  selectedTags: string[]
  unmatchedMovFiles: File[]
  hasMovFile: boolean
  phase: WorkflowPhase
  uploadEntries: FileProgressEntry[]
  uploadError: string | null
  processingError: string | null
  processingState: ProcessingState | null
  processingLogs: ProcessingLogEntry[]
  removeEntry: (entry: FileProgressEntry) => void
  beginUpload: () => Promise<void>
  abortCurrent: () => void
  reset: () => void
  closeModal: () => void
  setSelectedTags: (tags: string[]) => void
  cleanup: () => void
}

type PhotoUploadStoreParams = {
  files: File[]
  availableTags: string[]
  onUpload: (files: FileList, options: PhotoUploadRequestOptions) => void | Promise<void>
  onClose: () => void
}

export type PhotoUploadStore = StoreApi<PhotoUploadStoreState>

const PhotoUploadStoreContext = createContext<PhotoUploadStore | null>(null)

const computeUploadedBytes = (entries: FileProgressEntry[]) => calculateUploadedBytes(entries)
const MAX_PROCESSING_LOGS = 200
let processingLogSequence = 0
const UPLOAD_REQUEST_TIMEOUT_MS = 120_000

export function createPhotoUploadStore(params: PhotoUploadStoreParams): PhotoUploadStore {
  const { files: initialFiles, availableTags, onUpload, onClose } = params
  const initialEntries = createFileEntries(initialFiles)
  const totalSize = calculateTotalSize(initialFiles)
  const { unmatched: unmatchedMovFiles, hasMov } = collectUnmatchedMovFiles(initialFiles)

  let uploadAbortController: AbortController | null = null
  let processingAbortController: AbortController | null = null

  const store = createStore<PhotoUploadStoreState>((set, get) => {
    const updateEntries = (updater: (entries: FileProgressEntry[]) => FileProgressEntry[]) => {
      set((state) => {
        const nextEntries = updater(state.uploadEntries)
        return {
          uploadEntries: nextEntries,
          uploadedBytes: computeUploadedBytes(nextEntries),
        }
      })
    }

    const handleProcessingEvent = (event: PhotoSyncProgressEvent) => {
      if (event.type === 'start') {
        const { summary, totals, options } = event.payload
        set({
          processingState: {
            dryRun: options.dryRun ?? false,
            summary,
            totals,
            stages: createStageStateFromTotals(totals),
            completed: false,
          },
          processingLogs: [],
        })
        return
      }

      set((state) => {
        const prev = state.processingState
        if (!prev) {
          return {}
        }

        switch (event.type) {
          case 'stage': {
            const { stage, status, processed, total, summary } = event.payload
            return {
              processingState: {
                ...prev,
                summary,
                stages: {
                  ...prev.stages,
                  [stage]: {
                    status: status === 'complete' || total === 0 ? 'completed' : 'running',
                    processed,
                    total,
                  },
                },
              },
            }
          }
          case 'action': {
            const { stage, index, total, summary } = event.payload
            return {
              processingState: {
                ...prev,
                summary,
                stages: {
                  ...prev.stages,
                  [stage]: {
                    status: total === 0 ? 'completed' : 'running',
                    processed: index,
                    total,
                  },
                },
              },
            }
          }
          case 'log': {
            const timestamp = Date.parse(event.payload.timestamp)
            const logEntry: ProcessingLogEntry = {
              id: `log-${processingLogSequence++}`,
              message: event.payload.message,
              level: event.payload.level,
              timestamp: Number.isNaN(timestamp) ? Date.now() : timestamp,
            }
            return {
              processingState: {
                ...prev,
                latestLog: {
                  message: logEntry.message,
                  level: logEntry.level,
                  timestamp: logEntry.timestamp,
                },
              },
              processingLogs: [...state.processingLogs, logEntry].slice(-MAX_PROCESSING_LOGS),
            }
          }
          case 'error': {
            return {
              processingState: {
                ...prev,
                error: event.payload.message,
              },
            }
          }
          case 'complete': {
            return {
              processingState: {
                ...prev,
                summary: event.payload.summary,
                completed: true,
              },
            }
          }
          default: {
            return {}
          }
        }
      })
    }

    const startProcessing = async () => {
      set((state) => ({
        phase: 'processing',
        processingError: null,
        processingState: state.processingState,
      }))

      updateEntries((entries) =>
        entries.map((entry) => ({
          ...entry,
          status: entry.status === 'uploaded' ? 'processing' : entry.status,
        })),
      )

      const controller = new AbortController()
      processingAbortController = controller

      try {
        await runPhotoSync(
          { dryRun: false },
          {
            signal: controller.signal,
            onEvent: handleProcessingEvent,
          },
        )

        updateEntries((entries) =>
          entries.map((entry) => ({
            ...entry,
            status: entry.status === 'processing' ? 'done' : entry.status,
          })),
        )

        set((state) => ({
          phase: 'completed',
          processingState: state.processingState
            ? {
                ...state.processingState,
                completed: true,
              }
            : state.processingState,
        }))
      } catch (error) {
        const isAbort = (error as DOMException)?.name === 'AbortError'
        const message = isAbort ? '服务器处理已终止' : getErrorMessage(error, '服务器处理失败，请稍后再试。')

        updateEntries((entries) =>
          entries.map((entry) => ({
            ...entry,
            status: entry.status === 'processing' ? 'error' : entry.status,
          })),
        )

        set({
          processingError: message,
          phase: 'error',
        })
      } finally {
        processingAbortController = null
      }
    }

    const handleUploadProgress: NonNullable<PhotoUploadRequestOptions['onUploadProgress']> = (snapshot) => {
      const progressMap = new Map(snapshot.files.map((file) => [file.index, file]))
      updateEntries((entries) =>
        entries.map((entry) => {
          const current = progressMap.get(entry.index)
          if (!current) {
            return entry
          }
          return {
            ...entry,
            status: entry.status === 'pending' ? 'uploading' : entry.status,
            progress: current.progress,
            uploadedBytes: current.uploadedBytes,
          }
        }),
      )
    }

    return {
      files: initialFiles,
      totalSize,
      uploadedBytes: 0,
      availableTags,
      selectedTags: [],
      unmatchedMovFiles,
      hasMovFile: hasMov,
      phase: 'review',
      uploadEntries: initialEntries,
      uploadError: null,
      processingError: null,
      processingState: null,
      processingLogs: [],
      removeEntry: (entry) => {
        set((state) => {
          if (state.phase !== 'review') {
            return {}
          }

          const nextFiles = state.files.filter((_, index) => index !== entry.index)
          if (nextFiles.length === state.files.length) {
            return {}
          }
          const nextEntries = createFileEntries(nextFiles)
          const nextTotalSize = calculateTotalSize(nextFiles)
          const { unmatched, hasMov } = collectUnmatchedMovFiles(nextFiles)

          return {
            files: nextFiles,
            totalSize: nextTotalSize,
            unmatchedMovFiles: unmatched,
            hasMovFile: hasMov,
            uploadEntries: nextEntries,
            uploadedBytes: computeUploadedBytes(nextEntries),
          }
        })
      },
      beginUpload: async () => {
        const state = get()
        if (state.unmatchedMovFiles.length > 0 || state.phase === 'uploading' || state.phase === 'processing') {
          return
        }
        if (state.files.length === 0) {
          return
        }

        set({
          uploadError: null,
          processingError: null,
          processingState: null,
          phase: 'uploading',
          processingLogs: [],
        })

        updateEntries((entries) =>
          entries.map((entry) => ({
            ...entry,
            status: 'uploading',
          })),
        )

        const controller = new AbortController()
        uploadAbortController = controller

        try {
          const directory = deriveDirectoryFromTags(get().selectedTags)
          const fileList = createFileList(get().files)
          await onUpload(fileList, {
            signal: controller.signal,
            directory: directory ?? undefined,
            onUploadProgress: handleUploadProgress,
            timeoutMs: UPLOAD_REQUEST_TIMEOUT_MS,
          })

          updateEntries((entries) =>
            entries.map((entry) => ({
              ...entry,
              status: 'uploaded',
              progress: 1,
              uploadedBytes: entry.size,
            })),
          )

          await startProcessing()
        } catch (error) {
          const isAbort = (error as DOMException)?.name === 'AbortError'
          if (isAbort) {
            set({ phase: 'review' })
            const currentFiles = get().files
            updateEntries(() => createFileEntries(currentFiles))
          } else {
            const message = getErrorMessage(error, '上传失败，请稍后再试。')
            set({
              uploadError: message,
              phase: 'error',
            })
            updateEntries((entries) =>
              entries.map((entry) => ({
                ...entry,
                status: entry.status === 'uploading' ? 'error' : entry.status,
              })),
            )
          }
        } finally {
          uploadAbortController = null
        }
      },
      abortCurrent: () => {
        const { phase } = get()
        if (phase === 'uploading') {
          uploadAbortController?.abort()
          uploadAbortController = null
          set({ phase: 'review' })
          const currentFiles = get().files
          updateEntries(() => createFileEntries(currentFiles))
          return
        }
        if (phase === 'processing') {
          processingAbortController?.abort()
          processingAbortController = null
          set({
            processingError: '服务器处理已终止',
            phase: 'error',
          })
          updateEntries((entries) =>
            entries.map((entry) => ({
              ...entry,
              status: entry.status === 'processing' ? 'error' : entry.status,
            })),
          )
          return
        }
      },
      reset: () => {
        uploadAbortController?.abort()
        processingAbortController?.abort()
        uploadAbortController = null
        processingAbortController = null
        set({
          phase: 'review',
          uploadError: null,
          processingError: null,
          processingState: null,
          processingLogs: [],
        })
        const currentFiles = get().files
        updateEntries(() => createFileEntries(currentFiles))
      },
      closeModal: () => {
        get().cleanup()
        onClose()
      },
      setSelectedTags: (tags: string[]) => {
        set({ selectedTags: tags })
      },
      cleanup: () => {
        uploadAbortController?.abort()
        processingAbortController?.abort()
        uploadAbortController = null
        processingAbortController = null
      },
    }
  })

  return store
}

type PhotoUploadStoreProviderProps = PhotoUploadStoreParams & {
  children: ReactNode
}

export function PhotoUploadStoreProvider({
  children,
  files,
  availableTags,
  onUpload,
  onClose,
}: PhotoUploadStoreProviderProps) {
  const store = useMemo(
    () => createPhotoUploadStore({ files, availableTags, onUpload, onClose }),
    [files, availableTags, onUpload, onClose],
  )

  useEffect(() => {
    return () => {
      store.getState().cleanup()
    }
  }, [store])

  return <PhotoUploadStoreContext value={store}>{children}</PhotoUploadStoreContext>
}

export function usePhotoUploadStore<U>(selector: (state: PhotoUploadStoreState) => U) {
  const store = use(PhotoUploadStoreContext)
  if (!store) {
    throw new Error('usePhotoUploadStore must be used within PhotoUploadStoreProvider')
  }
  return useStore(store, selector)
}
