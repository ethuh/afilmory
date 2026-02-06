import { spawn } from 'node:child_process'

import type { NextRequest } from 'next/server'
import { NextResponse } from 'next/server'

export const runtime = 'nodejs'

type VideoTechInfo = {
  durationMs: number | null
  width: number | null
  height: number | null
}

const ALLOWED_HOST_SUFFIXES = [
  '.sharepoint.com',
  '.sharepoint.cn',
  '.1drv.com',
  '.onedrive.com',
  '.files.1drv.com',
  '.dl.delivery.mp.microsoft.com',
  '.svc.ms',
]

function isLoopbackHost(hostname: string) {
  return hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '::1'
}

function isAllowedUrl(url: URL, req: NextRequest) {
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return false

  const hostname = url.hostname.toLowerCase()
  const {pathname} = url
  const sameHost = hostname === req.nextUrl.hostname.toLowerCase()

  if (sameHost || isLoopbackHost(hostname)) {
    return pathname.startsWith('/originals/')
  }

  return ALLOWED_HOST_SUFFIXES.some((suffix) => hostname.endsWith(suffix))
}

async function ffprobe(targetUrl: string): Promise<VideoTechInfo> {
  const args = [
    '-v',
    'error',
    '-select_streams',
    'v:0',
    '-show_entries',
    'format=duration:stream=width,height',
    '-of',
    'json',
    targetUrl,
  ]

  const child = spawn('ffprobe', args, {
    stdio: ['ignore', 'pipe', 'pipe'],
  })

  const stdout: Buffer[] = []
  const stderr: Buffer[] = []

  child.stdout.on('data', (chunk) => stdout.push(Buffer.from(chunk)))
  child.stderr.on('data', (chunk) => stderr.push(Buffer.from(chunk)))

  const result = await new Promise<VideoTechInfo>((resolve, reject) => {
    const timeout = setTimeout(() => {
      child.kill('SIGKILL')
      reject(new Error('FFPROBE_TIMEOUT'))
    }, 15_000)

    child.on('error', (error) => {
      clearTimeout(timeout)
      reject(error)
    })

    child.on('close', (code) => {
      clearTimeout(timeout)
      const out = Buffer.concat(stdout).toString('utf8')

      if (code !== 0) {
        const err = Buffer.concat(stderr).toString('utf8')
        reject(new Error(`FFPROBE_FAILED:${code}:${err.slice(0, 500)}`))
        return
      }

      try {
        const parsed = JSON.parse(out) as {
          streams?: Array<{ width?: number; height?: number }>
          format?: { duration?: string }
        }
        const durationSeconds = parsed.format?.duration ? Number(parsed.format.duration) : Number.NaN
        const durationMs = Number.isFinite(durationSeconds) ? Math.round(durationSeconds * 1000) : null
        const stream = parsed.streams?.[0]
        const width = typeof stream?.width === 'number' && stream.width > 0 ? stream.width : null
        const height = typeof stream?.height === 'number' && stream.height > 0 ? stream.height : null
        resolve({ durationMs, width, height })
      } catch (error) {
        reject(error)
      }
    })
  })

  return result
}

export const GET = async (req: NextRequest) => {
  const raw = req.nextUrl.searchParams.get('url')
  if (!raw) {
    return NextResponse.json({ error: 'MISSING_URL' }, { status: 400 })
  }

  let target: URL
  try {
    target = new URL(raw, req.nextUrl.origin)
  } catch {
    return NextResponse.json({ error: 'INVALID_URL' }, { status: 400 })
  }

  if (!isAllowedUrl(target, req)) {
    return NextResponse.json({ error: 'URL_NOT_ALLOWED' }, { status: 400 })
  }

  try {
    const info = await ffprobe(target.toString())
    return NextResponse.json(info)
  } catch (error) {
    console.error('[api/media/probe] ffprobe failed', error)
    return NextResponse.json({ durationMs: null, width: null, height: null })
  }
}
