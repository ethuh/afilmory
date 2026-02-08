import path from 'node:path'

import { CompatibleLoggerAdapter } from '@afilmory/builder/photo/logger-adapter.js'
import consola from 'consola'

import { SUPPORTED_FORMATS } from '../../constants/index.js'
import { logger } from '../../logger/index.js'
import type {
  OpenListConfig,
  ProgressCallback,
  StorageObject,
  StorageProvider,
  StorageUploadOptions,
} from '../interfaces.js'

type OpenListEnvelope<T> = {
  code: number
  message: string
  data: T
}

type OpenListFsObject = {
  name: string
  path: string
  size?: number
  is_dir: boolean
  modified?: string
  sign?: string
  raw_url?: string
  thumb?: string
}

type OpenListFsListData = {
  content: OpenListFsObject[]
  total?: number
  provider?: string
}

type OpenListFsGetData = OpenListFsObject

type OpenListFileRuntimeInfo = {
  path: string
  rawUrl: string | null
  sign: string | null
  size?: number
  lastModified?: Date
}

function normalizeBaseUrl(input: string) {
  return input.replace(/\/+$/, '')
}

function normalizeOpenListPath(input: string) {
  if (!input) return '/'
  const normalized = input.replaceAll('\\', '/').replace(/\/+$/, '')
  return normalized.startsWith('/') ? normalized : `/${normalized}`
}

function getMountName(fsPath: string): string | null {
  const normalized = normalizeOpenListPath(fsPath)
  const part = normalized.split('/').find(Boolean)
  return part ?? null
}

function joinOpenListPath(parent: string, name: string) {
  const parentNormalized = normalizeOpenListPath(parent)
  const parentWithoutTrailing = parentNormalized.replace(/\/+$/, '')
  const safeName = name.replaceAll('\\', '/').replace(/^\/+/, '')
  return `${parentWithoutTrailing}/${safeName}`
}

function resolveChildFsPath(currentPath: string, childPath: string) {
  const mount = getMountName(currentPath)
  const normalizedChild = normalizeOpenListPath(childPath)
  if (!mount) return normalizedChild

  if (normalizedChild === `/${mount}` || normalizedChild.startsWith(`/${mount}/`)) {
    return normalizedChild
  }

  // OpenList may return paths relative to the current mount (e.g. /sangmei/...)
  // Ensure the mount prefix is always present.
  return `/${mount}${normalizedChild}`
}

function keyFromFsPath(fsPath: string) {
  return fsPath.replaceAll('\\', '/').replace(/^\/+/, '')
}

function encodePathSegments(p: string) {
  const hasLeadingSlash = p.startsWith('/')
  const parts = p.split('/').filter(Boolean)
  const encoded = parts.map((part) => encodeURIComponent(part)).join('/')
  return hasLeadingSlash ? `/${encoded}` : encoded
}

export class OpenListStorageProvider implements StorageProvider {
  private config: OpenListConfig
  private readonly baseUrl: string
  private readonly perPage: number
  private readonly refresh: boolean
  private readonly requestTimeoutMs: number

  private token: string | null
  private readonly fileInfoByKey = new Map<string, OpenListFileRuntimeInfo>()

  private logger = new CompatibleLoggerAdapter(consola.withTag('OPENLIST'))

  constructor(config: OpenListConfig) {
    if (!config.baseUrl || config.baseUrl.trim() === '') {
      throw new Error('OpenListStorageProvider: baseUrl 不能为空')
    }
    if (!Array.isArray(config.roots) || config.roots.length === 0) {
      throw new Error('OpenListStorageProvider: roots 不能为空')
    }
    if (config.excludeRegex) {
      try {
        new RegExp(config.excludeRegex)
      } catch (error) {
        throw new Error(`OpenListStorageProvider: excludeRegex 不是有效的正则表达式: ${error}`)
      }
    }
    if (config.maxFileLimit && config.maxFileLimit <= 0) {
      throw new Error('OpenListStorageProvider: maxFileLimit 必须大于 0')
    }

    this.config = config
    this.baseUrl = normalizeBaseUrl(config.baseUrl)
    this.perPage = Math.min(Math.max(config.perPage ?? 100, 1), 100)
    this.refresh = Boolean(config.refresh)
    this.requestTimeoutMs = config.requestTimeoutMs ?? 30_000
    this.token = config.token ?? null
  }

  private resolvePasswordForPath(fsPath: string) {
    const normalized = normalizeOpenListPath(fsPath)
    return this.config.pathPasswords?.[normalized] ?? ''
  }

  private async ensureToken(): Promise<string> {
    if (this.token) return this.token

    const username =
      (typeof this.config.username === 'string' && this.config.username.trim()) ||
      (process.env.OPENLIST_USERNAME?.trim() ?? '')
    const password =
      (typeof this.config.password === 'string' && this.config.password.trim()) ||
      (process.env.OPENLIST_PASSWORD?.trim() ?? '')
    if (!username || !password) {
      throw new Error(
        'OpenListStorageProvider: missing username/password (set in config or OPENLIST_USERNAME/PASSWORD)',
      )
    }

    const url = `${this.baseUrl}/api/auth/login`
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), this.requestTimeoutMs)

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          username,
          password,
        }),
        signal: controller.signal,
      })

      if (!response.ok) {
        throw new Error(`OpenList login failed: ${response.status} ${response.statusText}`)
      }

      const payload = (await response.json()) as OpenListEnvelope<{ token: string }>
      if (payload.code !== 200 || !payload.data?.token) {
        throw new Error(`OpenList login failed: ${payload.code} ${payload.message}`)
      }

      this.token = payload.data.token
      return this.token
    } finally {
      clearTimeout(timer)
    }
  }

  private async apiPost<T>(apiPath: string, body: Record<string, unknown>): Promise<T> {
    await this.ensureToken()

    const url = `${this.baseUrl}${apiPath}`
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), this.requestTimeoutMs)

    try {
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
      }
      if (this.token) {
        headers.Authorization = this.token
      }

      const response = await fetch(url, {
        method: 'POST',
        headers,
        body: JSON.stringify(body),
        signal: controller.signal,
      })

      if (!response.ok) {
        throw new Error(`OpenList API ${apiPath} failed: ${response.status} ${response.statusText}`)
      }

      const payload = (await response.json()) as OpenListEnvelope<T>
      if (payload.code !== 200) {
        throw new Error(`OpenList API ${apiPath} failed: ${payload.code} ${payload.message}`)
      }

      return payload.data
    } finally {
      clearTimeout(timer)
    }
  }

  private async listDirAllPages(fsPath: string): Promise<OpenListFsObject[]> {
    const password = this.resolvePasswordForPath(fsPath)
    const all: OpenListFsObject[] = []
    let page = 1

    while (true) {
      const data = await this.apiPost<OpenListFsListData>('/api/fs/list', {
        path: fsPath,
        password,
        refresh: this.refresh,
        page,
        per_page: this.perPage,
      })

      const content = Array.isArray(data.content) ? data.content : []
      all.push(...content)

      const total = typeof data.total === 'number' ? data.total : null
      if (total != null) {
        if (all.length >= total) break
      } else {
        if (content.length < this.perPage) break
      }

      page += 1
    }

    return all
  }

  private rememberFileInfo(obj: OpenListFsObject) {
    if (!obj.path) return
    const key = keyFromFsPath(obj.path)
    const lastModified = obj.modified ? new Date(obj.modified) : undefined
    const safeLastModified = lastModified && !Number.isNaN(lastModified.getTime()) ? lastModified : undefined
    this.fileInfoByKey.set(key, {
      path: obj.path,
      rawUrl: obj.raw_url ?? null,
      sign: obj.sign ?? null,
      size: obj.size,
      lastModified: safeLastModified,
    })
  }

  async listAllFiles(progressCallback?: ProgressCallback): Promise<StorageObject[]> {
    const excludeRegex = this.config.excludeRegex ? new RegExp(this.config.excludeRegex) : null

    const roots = this.config.roots.map(normalizeOpenListPath)
    const queue: string[] = [...roots]
    const files: StorageObject[] = []
    let scanned = 0
    let visitedDirs = 0
    let lastLoggedAt = 0

    while (queue.length > 0) {
      const currentPath = queue.shift()!
      visitedDirs += 1

      progressCallback?.({
        currentPath,
        filesScanned: scanned,
      })

      const now = Date.now()
      if (visitedDirs <= 5 || now - lastLoggedAt > 2_000) {
        lastLoggedAt = now
        logger.main.info(`[OPENLIST] 扫描中：${currentPath}（目录 ${visitedDirs}，文件 ${files.length}）`)
      }

      const entries = await this.listDirAllPages(currentPath)
      for (const entry of entries) {
        const resolvedFsPath = entry.path
          ? resolveChildFsPath(currentPath, entry.path)
          : entry.name
            ? joinOpenListPath(currentPath, entry.name)
            : null
        if (!resolvedFsPath) continue
        if (excludeRegex && excludeRegex.test(resolvedFsPath)) continue

        if (entry.is_dir) {
          queue.push(normalizeOpenListPath(resolvedFsPath))
          continue
        }

        this.rememberFileInfo({ ...entry, path: resolvedFsPath })
        const key = keyFromFsPath(resolvedFsPath)
        scanned += 1
        files.push({
          key,
          size: entry.size,
          lastModified: entry.modified ? new Date(entry.modified) : undefined,
        })

        if (this.config.maxFileLimit && files.length >= this.config.maxFileLimit) {
          return files
        }
      }
    }

    return files
  }

  async listImages(): Promise<StorageObject[]> {
    const allFiles = await this.listAllFiles()
    return allFiles.filter((file) => {
      const ext = path.extname(file.key).toLowerCase()
      return SUPPORTED_FORMATS.has(ext)
    })
  }

  async generatePublicUrl(key: string): Promise<string> {
    const cached = this.fileInfoByKey.get(key)
    if (cached?.rawUrl) {
      return cached.rawUrl
    }

    const fsPath = `/${key.replaceAll('\\', '/').replace(/^\/+/, '')}`
    const password = this.resolvePasswordForPath(fsPath)
    const data = await this.apiPost<OpenListFsGetData>('/api/fs/get', {
      path: fsPath,
      password,
    })
    this.rememberFileInfo(data)

    const runtime = this.fileInfoByKey.get(key)
    if (runtime?.rawUrl) {
      return runtime.rawUrl
    }

    // Fallback: best-effort /d path.
    // Not all deployments allow it, but it keeps the provider functional when raw_url is omitted.
    return `${this.baseUrl}/d${encodePathSegments(fsPath)}`
  }

  async getFile(key: string): Promise<Buffer | null> {
    try {
      const url = await this.generatePublicUrl(key)
      const controller = new AbortController()
      const timer = setTimeout(() => controller.abort(), this.requestTimeoutMs)
      try {
        const response = await fetch(url, {
          method: 'GET',
          signal: controller.signal,
        })
        if (!response.ok) {
          if (response.status === 404) return null
          throw new Error(`OpenList getFile failed: ${response.status} ${response.statusText}`)
        }
        const buffer = Buffer.from(await response.arrayBuffer())
        return buffer
      } finally {
        clearTimeout(timer)
      }
    } catch (error) {
      this.logger.error(`读取文件失败：${key}`, error)
      return null
    }
  }

  detectLivePhotos(allObjects: StorageObject[]): Map<string, StorageObject> {
    const livePhotoMap = new Map<string, StorageObject>()
    const fileGroups = new Map<string, StorageObject[]>()

    for (const obj of allObjects) {
      const { key } = obj
      if (!key) continue

      const dir = path.dirname(key)
      const basename = path.parse(key).name
      const groupKey = `${dir}/${basename}`
      const existing = fileGroups.get(groupKey)
      if (existing) {
        existing.push(obj)
      } else {
        fileGroups.set(groupKey, [obj])
      }
    }

    for (const files of fileGroups.values()) {
      let imageFile: StorageObject | null = null
      let videoFile: StorageObject | null = null

      for (const file of files) {
        if (!file.key) continue
        const ext = path.extname(file.key).toLowerCase()
        if (SUPPORTED_FORMATS.has(ext)) {
          imageFile = file
        } else if (ext === '.mov' || ext === '.mp4') {
          videoFile = file
        }
      }

      if (imageFile?.key && videoFile) {
        livePhotoMap.set(imageFile.key, videoFile)
      }
    }

    return livePhotoMap
  }

  async deleteFile(_key: string): Promise<void> {
    throw new Error('OpenListStorageProvider: deleteFile is not supported')
  }

  async deleteFolder(_prefix: string): Promise<void> {
    throw new Error('OpenListStorageProvider: deleteFolder is not supported')
  }

  async uploadFile(_key: string, _data: Buffer, _options?: StorageUploadOptions): Promise<StorageObject> {
    throw new Error('OpenListStorageProvider: uploadFile is not supported')
  }

  async moveFile(_sourceKey: string, _targetKey: string, _options?: StorageUploadOptions): Promise<StorageObject> {
    throw new Error('OpenListStorageProvider: moveFile is not supported')
  }
}
