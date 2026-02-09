import path from 'node:path'

import type { NextRequest } from 'next/server'
import { NextResponse } from 'next/server'

import { isOpenListConfigured, normalizeKey, openListGeneratePublicUrl } from '~/lib/openlist'

export const runtime = 'nodejs'

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
    console.warn('[api/openlist/file] OPENLIST_NOT_CONFIGURED')
    return NextResponse.json({ error: 'OPENLIST_NOT_CONFIGURED' }, { status: 500 })
  }

  const key = normalizeKey(rawKey)
  console.info('[api/openlist/file] fetch start', { key })
  const targetUrl = await openListGeneratePublicUrl(key)
  if (!targetUrl) {
    console.warn('[api/openlist/file] public url missing', { key })
    return NextResponse.json({ error: 'NOT_FOUND' }, { status: 404 })
  }

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 30_000)
  try {
    let response: Response
    try {
      response = await fetch(targetUrl, {
        method: 'GET',
        signal: controller.signal,
      })
    } catch (error) {
      console.warn('[api/openlist/file] upstream fetch failed', {
        key,
        targetUrl,
        error: error instanceof Error ? error.message : String(error),
      })
      return NextResponse.json({ error: 'UPSTREAM_FETCH_FAILED' }, { status: 502 })
    }
    if (!response.ok) {
      console.warn('[api/openlist/file] upstream failed', {
        key,
        status: response.status,
        statusText: response.statusText,
      })
      return NextResponse.json({ error: 'UPSTREAM_FAILED' }, { status: 502 })
    }

    const ext = path.posix.extname(key).toLowerCase()
    const contentType = ext === '.ass' || ext === '.nfo' ? 'text/plain; charset=utf-8' : 'application/octet-stream'
    const buffer = Buffer.from(await response.arrayBuffer())
    if (buffer.byteLength > 2_000_000) {
      console.warn('[api/openlist/file] file too large', { key, bytes: buffer.byteLength })
      return NextResponse.json({ error: 'FILE_TOO_LARGE' }, { status: 413 })
    }

    console.info('[api/openlist/file] fetch ok', { key, bytes: buffer.byteLength, contentType })

    return new NextResponse(buffer, {
      headers: {
        'Content-Type': contentType,
        'Cache-Control': 'private, max-age=3600',
      },
    })
  } finally {
    clearTimeout(timer)
  }
}
