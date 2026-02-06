import { apiFetch } from '~/lib/api/http'

export type VideoTechInfo = {
  durationMs: number | null
  width: number | null
  height: number | null
}

export function getFileExtension(input: string): string {
  const clean = input.split('?')[0].split('#')[0]
  const lastDot = clean.lastIndexOf('.')
  if (lastDot === -1) return ''
  return clean.slice(lastDot + 1).toLowerCase()
}

export function resolveAbsoluteUrl(url: string): string {
  // Keep absolute urls intact
  if (/^https?:\/\//i.test(url)) return url
  return new URL(url, window.location.origin).toString()
}

export async function probeViaVideoElement(url: string): Promise<VideoTechInfo> {
  const abs = resolveAbsoluteUrl(url)

  return await new Promise<VideoTechInfo>((resolve, reject) => {
    const video = document.createElement('video')
    ;(video as any).playsInline = true
    video.muted = true
    video.preload = 'metadata'

    let timeout = 0
    const cleanup = () => {
      if (timeout) window.clearTimeout(timeout)
      timeout = 0
      video.removeEventListener('loadedmetadata', onLoaded)
      video.removeEventListener('error', onError)
      try {
        video.src = ''
      } catch {
        // ignore
      }
    }

    const onLoaded = () => {
      cleanup()
      const durationMs = Number.isFinite(video.duration) ? Math.round(video.duration * 1000) : null
      const width = Number.isFinite(video.videoWidth) && video.videoWidth > 0 ? video.videoWidth : null
      const height = Number.isFinite(video.videoHeight) && video.videoHeight > 0 ? video.videoHeight : null
      resolve({ durationMs, width, height })
    }

    const onError = () => {
      cleanup()
      reject(new Error('VIDEO_METADATA_ERROR'))
    }

    video.addEventListener('loadedmetadata', onLoaded)
    video.addEventListener('error', onError)
    timeout = window.setTimeout(() => {
      cleanup()
      reject(new Error('VIDEO_METADATA_TIMEOUT'))
    }, 12_000)

    video.src = abs
    video.load()
  })
}

export async function probeViaServer(url: string): Promise<VideoTechInfo> {
  const abs = resolveAbsoluteUrl(url)
  const params = new URLSearchParams({ url: abs })
  return await apiFetch<VideoTechInfo>(`/api/media/probe?${params.toString()}`)
}
