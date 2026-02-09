import path from 'node:path'

import { env } from '~/env'

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
}

type OpenListFsGetData = OpenListFsObject

function normalizeBaseUrl(input: string) {
  return input.replace(/\/+$/, '')
}

function encodePathSegments(p: string) {
  const hasLeadingSlash = p.startsWith('/')
  const parts = p.split('/').filter(Boolean)
  const encoded = parts.map((part) => encodeURIComponent(part)).join('/')
  return hasLeadingSlash ? `/${encoded}` : encoded
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

  return `/${mount}${normalizedChild}`
}

function keyFromFsPath(fsPath: string) {
  return fsPath.replaceAll('\\', '/').replace(/^\/+/, '')
}

function isConfigured() {
  return Boolean(env.OPENLIST_BASE_URL && env.OPENLIST_USERNAME && env.OPENLIST_PASSWORD)
}

function getConfigOrThrow() {
  const baseUrl = env.OPENLIST_BASE_URL?.trim() ?? ''
  const username = env.OPENLIST_USERNAME?.trim() ?? ''
  const password = env.OPENLIST_PASSWORD?.trim() ?? ''
  if (!baseUrl || !username || !password) {
    throw new Error('OPENLIST_NOT_CONFIGURED')
  }
  return {
    baseUrl: normalizeBaseUrl(baseUrl),
    username,
    password,
    requestTimeoutMs: 30_000,
  }
}

let cachedToken: string | null = null
let cachedTokenAt = 0

async function login(): Promise<string> {
  const cfg = getConfigOrThrow()
  const url = `${cfg.baseUrl}/api/auth/login`
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), cfg.requestTimeoutMs)

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: cfg.username, password: cfg.password }),
      signal: controller.signal,
    })
    if (!response.ok) {
      throw new Error(`OPENLIST_LOGIN_FAILED:${response.status}:${response.statusText}`)
    }
    const payload = (await response.json()) as OpenListEnvelope<{ token: string }>
    if (payload.code !== 200 || !payload.data?.token) {
      throw new Error(`OPENLIST_LOGIN_FAILED:${payload.code}:${payload.message}`)
    }
    cachedToken = payload.data.token
    cachedTokenAt = Date.now()
    return cachedToken
  } finally {
    clearTimeout(timer)
  }
}

async function ensureToken(): Promise<string> {
  // Best-effort reuse: OpenList tokens are typically long-lived but we still refresh occasionally.
  if (cachedToken && Date.now() - cachedTokenAt < 1000 * 60 * 30) {
    return cachedToken
  }
  return await login()
}

export async function openListApiPost<T>(apiPath: string, body: Record<string, unknown>): Promise<T> {
  const cfg = getConfigOrThrow()
  const token = await ensureToken()

  const url = `${cfg.baseUrl}${apiPath}`
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), cfg.requestTimeoutMs)
  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: token,
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    })

    if (!response.ok) {
      throw new Error(`OPENLIST_API_FAILED:${apiPath}:${response.status}:${response.statusText}`)
    }

    const payload = (await response.json()) as OpenListEnvelope<T>
    if (payload.code !== 200) {
      throw new Error(`OPENLIST_API_FAILED:${apiPath}:${payload.code}:${payload.message}`)
    }

    return payload.data
  } finally {
    clearTimeout(timer)
  }
}

export type OpenListSidecarResult = {
  ass?: { key: string; fetchUrl: string } | null
  nfo?: { key: string; fetchUrl: string } | null
}

export function isOpenListConfigured() {
  return isConfigured()
}

export function normalizeKey(input: string) {
  return input.replaceAll('\\', '/').replace(/^\/+/, '')
}

export function keyDirname(key: string) {
  const normalized = normalizeKey(key)
  const dir = path.posix.dirname(normalized)
  return dir === '.' ? '' : dir
}

export function keyBasenameNoExt(key: string) {
  const normalized = normalizeKey(key)
  return path.posix.parse(normalized).name
}

export async function openListTryGetFile(key: string): Promise<OpenListFsGetData | null> {
  const normalized = normalizeKey(key)
  const fsPath = `/${normalized}`
  try {
    const data = await openListApiPost<OpenListFsGetData>('/api/fs/get', {
      path: fsPath,
      password: '',
    })
    return data
  } catch (error) {
    console.warn('[openlist] fs/get failed', {
      key,
      fsPath,
      error: error instanceof Error ? error.message : String(error),
    })
    return null
  }
}

export async function openListGeneratePublicUrl(key: string): Promise<string | null> {
  const cfg = getConfigOrThrow()
  const fsPath = `/${normalizeKey(key)}`
  // Prefer OpenList download route to avoid direct upstream (e.g. SharePoint) fetches from SSR.
  return `${cfg.baseUrl}/d${encodePathSegments(fsPath)}`
}

export async function openListListDirAllPages(fsDirPath: string): Promise<OpenListFsObject[]> {
  const dir = normalizeOpenListPath(fsDirPath)
  const all: OpenListFsObject[] = []
  let page = 1
  const perPage = 100

  while (true) {
    const data = await openListApiPost<OpenListFsListData>('/api/fs/list', {
      path: dir,
      password: '',
      refresh: false,
      page,
      per_page: perPage,
    })
    const content = Array.isArray(data.content) ? data.content : []
    all.push(...content)

    const total = typeof data.total === 'number' ? data.total : null
    if (total != null) {
      if (all.length >= total) break
    } else {
      if (content.length < perPage) break
    }
    page += 1
  }

  return all
}

export function resolveEntryKey(currentFsDirPath: string, entry: Pick<OpenListFsObject, 'path' | 'name'>) {
  const resolvedFsPath = entry.path
    ? resolveChildFsPath(currentFsDirPath, entry.path)
    : joinOpenListPath(currentFsDirPath, entry.name)
  return keyFromFsPath(resolvedFsPath)
}
