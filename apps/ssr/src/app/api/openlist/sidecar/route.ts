import path from 'node:path'

import type { NextRequest } from 'next/server'
import { NextResponse } from 'next/server'

import {
  isOpenListConfigured,
  keyBasenameNoExt,
  keyDirname,
  normalizeKey,
  openListListDirAllPages,
  type OpenListSidecarResult,
  openListTryGetFile,
  resolveEntryKey,
} from '~/lib/openlist'

export const runtime = 'nodejs'

function buildFetchUrl(key: string) {
  return `/api/openlist/file?key=${encodeURIComponent(key)}`
}

function isSafeKey(input: string) {
  if (!input) return false
  const normalized = normalizeKey(input)
  if (normalized.includes('..')) return false
  return true
}

export const GET = async (req: NextRequest) => {
  const rawKey = req.nextUrl.searchParams.get('key')
  if (!rawKey) {
    return NextResponse.json({ error: 'MISSING_KEY' }, { status: 400 })
  }
  if (!isSafeKey(rawKey)) {
    return NextResponse.json({ error: 'INVALID_KEY' }, { status: 400 })
  }
  if (!isOpenListConfigured()) {
    console.warn('[api/openlist/sidecar] OPENLIST_NOT_CONFIGURED')
    return NextResponse.json({ error: 'OPENLIST_NOT_CONFIGURED' }, { status: 500 })
  }

  const key = normalizeKey(rawKey)
  const dirKey = keyDirname(key)
  const base = keyBasenameNoExt(key)
  const dirPrefix = dirKey ? `${dirKey}/` : ''
  const candidateAssKey = `${dirPrefix}${base}.ass`
  const candidateNfoKey = `${dirPrefix}${base}.nfo`

  console.info('[api/openlist/sidecar] resolve start', {
    key,
    dirKey,
    base,
    candidateAssKey,
    candidateNfoKey,
  })

  const result: OpenListSidecarResult = {
    ass: null,
    nfo: null,
  }

  // 1) Fast path: try exact same-name sidecars.
  const [assObj, nfoObj] = await Promise.all([openListTryGetFile(candidateAssKey), openListTryGetFile(candidateNfoKey)])
  if (assObj && !assObj.is_dir) {
    result.ass = { key: candidateAssKey, fetchUrl: buildFetchUrl(candidateAssKey) }
  }
  if (nfoObj && !nfoObj.is_dir) {
    result.nfo = { key: candidateNfoKey, fetchUrl: buildFetchUrl(candidateNfoKey) }
  }

  console.info('[api/openlist/sidecar] exact match', {
    ass: Boolean(result.ass),
    nfo: Boolean(result.nfo),
  })
  if (result.ass && result.nfo) {
    return NextResponse.json(result)
  }

  // 2) Fallback: list only the current directory and try to find best match.
  const fsDirPath = dirKey ? `/${dirKey}` : '/'
  let entries: Array<{ key: string }>
  try {
    const rawEntries = await openListListDirAllPages(fsDirPath)
    entries = rawEntries.filter((entry) => !entry.is_dir).map((entry) => ({ key: resolveEntryKey(fsDirPath, entry) }))
  } catch {
    // If listing fails, return whatever we already found.
    console.warn('[api/openlist/sidecar] list dir failed', { fsDirPath })
    return NextResponse.json(result)
  }

  console.info('[api/openlist/sidecar] list dir ok', { fsDirPath, files: entries.length })

  let bestAss: { key: string; score: number } | null = null
  for (const entry of entries) {
    const ext = path.posix.extname(entry.key).toLowerCase()
    if (ext !== '.ass') continue
    const {name} = path.posix.parse(entry.key)

    let score = 0
    if (name === base) score = 3
    else if (name.startsWith(`${base}.`)) score = 2
    else continue

    if (!bestAss || score > bestAss.score) {
      bestAss = { key: entry.key, score }
      if (score === 3) break
    }
  }
  if (!result.ass && bestAss) {
    result.ass = { key: bestAss.key, fetchUrl: buildFetchUrl(bestAss.key) }
  }

  if (!result.nfo) {
    const exactNfoKey = `${dirPrefix}${base}.nfo`
    const hasExactNfo = entries.some((entry) => entry.key === exactNfoKey)
    if (hasExactNfo) {
      result.nfo = { key: exactNfoKey, fetchUrl: buildFetchUrl(exactNfoKey) }
    }
  }

  console.info('[api/openlist/sidecar] resolve done', {
    assKey: result.ass?.key ?? null,
    nfoKey: result.nfo?.key ?? null,
  })

  return NextResponse.json(result)
}
