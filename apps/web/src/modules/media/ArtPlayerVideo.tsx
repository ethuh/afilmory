import Artplayer from 'artplayer'
import SubtitlesOctopus from 'libass-wasm'
import { useEffect, useRef } from 'react'

async function loadLibassWorker({ workerUrl, wasmUrl }: { workerUrl: string; wasmUrl: string }) {
  const text = await fetch(workerUrl).then((res) => res.text())

  let workerScriptContent = text
  workerScriptContent = workerScriptContent.replaceAll(
    /wasmBinaryFile\s*=\s*(['"])(subtitles-octopus-worker\.wasm)\1/g,
    (_match, _quote, wasm) => {
      const absolute = wasmUrl || new URL(wasm, new URL(workerUrl, document.baseURI)).toString()
      return `wasmBinaryFile = "${absolute}"`
    },
  )

  const workerBlob = new Blob([workerScriptContent], { type: 'text/javascript' })
  return URL.createObjectURL(workerBlob)
}

function toAbsoluteUrl(url: string) {
  return new URL(url, document.baseURI).toString()
}

const DEBUG = import.meta.env.DEV

interface ArtPlayerVideoProps {
  url: string
  poster?: string
  active: boolean
  muted: boolean
  volume: number
  fit: 'contain' | 'cover'
  resumeAt?: number
  subtitleUrl?: string | null
  className?: string
  onVideoElementChange?: (el: HTMLVideoElement | null) => void
}

export const ArtPlayerVideo = ({
  url,
  poster,
  active,
  muted,
  volume,
  fit,
  resumeAt,
  subtitleUrl,
  className,
  onVideoElementChange,
}: ArtPlayerVideoProps) => {
  const containerRef = useRef<HTMLDivElement | null>(null)
  const artRef = useRef<Artplayer | null>(null)
  const hasAppliedResumeRef = useRef(false)
  const latestInitRef = useRef({ url, poster, muted, volume, fit })
  const assRef = useRef<SubtitlesOctopus | null>(null)
  const lastAssUrlRef = useRef<string | null>(null)
  const workerBlobUrlRef = useRef<string | null>(null)

  const shouldInit = active && url.length > 0

  useEffect(() => {
    latestInitRef.current = { url, poster, muted, volume, fit }
  }, [fit, muted, poster, url, volume])

  useEffect(() => {
    const container = containerRef.current
    if (!container) return

    if (!shouldInit) {
      const art = artRef.current
      if (art) {
        art.destroy()
        artRef.current = null
      }
      onVideoElementChange?.(null)
      hasAppliedResumeRef.current = false
      if (assRef.current) {
        assRef.current.dispose()
        assRef.current = null
      }
      lastAssUrlRef.current = null
      if (workerBlobUrlRef.current) {
        URL.revokeObjectURL(workerBlobUrlRef.current)
        workerBlobUrlRef.current = null
      }
      return
    }

    if (artRef.current) return

    const init = latestInitRef.current

    Artplayer.REMOVE_SRC_WHEN_DESTROY = true
    const art = new Artplayer({
      container,
      url: init.url,
      poster: init.poster ?? '',
      muted: init.muted,
      volume: init.volume,
      theme: 'var(--color-accent)',
      backdrop: true,
      setting: true,
      playbackRate: true,
      aspectRatio: true,
      flip: true,
      subtitleOffset: true,
      pip: true,
      screenshot: true,
      settings: [
        {
          html: 'Subtitle',
          tooltip: 'Show',
          selector: [
            { default: true, html: 'Show', value: true },
            { html: 'Hide', value: false },
          ],
          onSelect(item) {
            this.subtitle.show = Boolean(item.value)
            this.emit('subtitle', Boolean(item.value))
            return item.html
          },
        },
      ],
      cssVar: {
        '--art-theme': 'var(--color-accent)',
        '--art-font-color': 'rgba(255, 255, 255, 0.92)',
        '--art-background-color': 'rgba(0, 0, 0, 0.35)',
        '--art-widget-background': 'rgba(20, 20, 22, 0.72)',
        '--art-tip-background': 'rgba(20, 20, 22, 0.78)',
        '--art-border-radius': '16px',
        '--art-padding': '10px',
        '--art-control-height': '44px',
        '--art-control-icon-size': '20px',
        '--art-progress-height': '3px',
        '--art-progress-color': 'rgba(255, 255, 255, 0.22)',
        '--art-loaded-color': 'rgba(255, 255, 255, 0.35)',
        '--art-hover-color': 'rgba(255, 255, 255, 0.35)',
        '--art-bottom-gap': '10px',
        '--art-bottom-offset': '10px',
        '--art-scrollbar-size': '6px',
        '--art-scrollbar-background': 'rgba(255, 255, 255, 0.14)',
        '--art-scrollbar-background-hover': 'rgba(255, 255, 255, 0.22)',
      },
      autoplay: false,
      autoSize: false,
      playsInline: true,
      isLive: false,
      moreVideoAttr: {
        preload: 'metadata',
        crossOrigin: 'anonymous',
      },
    })
    artRef.current = art

    onVideoElementChange?.(art.video)
    art.video.style.objectFit = init.fit === 'cover' ? 'cover' : 'contain'
    art.video.style.width = '100%'
    art.video.style.height = '100%'

    const handleSubtitle = (visible: boolean) => {
      const canvasParent = assRef.current?.canvasParent
      if (!canvasParent) return
      canvasParent.style.display = visible ? 'block' : 'none'
    }

    const handleSubtitleOffset = (offset: number) => {
      if (assRef.current) {
        assRef.current.timeOffset = offset
      }
    }

    art.on('subtitle', handleSubtitle)
    art.on('subtitleOffset', handleSubtitleOffset)

    return () => {
      art.off('subtitle', handleSubtitle)
      art.off('subtitleOffset', handleSubtitleOffset)
      if (artRef.current === art) {
        art.destroy()
        artRef.current = null
      }
      onVideoElementChange?.(null)
      hasAppliedResumeRef.current = false
      if (assRef.current) {
        assRef.current.dispose()
        assRef.current = null
      }
      lastAssUrlRef.current = null
      if (workerBlobUrlRef.current) {
        URL.revokeObjectURL(workerBlobUrlRef.current)
        workerBlobUrlRef.current = null
      }
    }
  }, [onVideoElementChange, shouldInit])

  useEffect(() => {
    const art = artRef.current
    if (!art || !shouldInit) return
    art.muted = muted
    art.volume = volume
  }, [muted, shouldInit, volume])

  useEffect(() => {
    const art = artRef.current
    if (!art || !shouldInit) return

    if (poster && art.poster !== poster) {
      art.poster = poster
    }
  }, [poster, shouldInit])

  useEffect(() => {
    const art = artRef.current
    if (!art || !shouldInit) return

    art.video.style.objectFit = fit === 'cover' ? 'cover' : 'contain'
  }, [fit, shouldInit])

  useEffect(() => {
    const art = artRef.current
    if (!art || !shouldInit) return

    if (art.url !== url) {
      hasAppliedResumeRef.current = false
      void art.switchUrl(url)
    }
  }, [shouldInit, url])

  useEffect(() => {
    const art = artRef.current
    if (!art || !shouldInit) return

    const maybeSeek = () => {
      if (hasAppliedResumeRef.current) return
      if (typeof resumeAt !== 'number' || !Number.isFinite(resumeAt) || resumeAt <= 0) return
      try {
        art.currentTime = resumeAt
      } catch {
        // ignore
      }
      hasAppliedResumeRef.current = true
    }

    const handleLoadedMetadata = () => {
      maybeSeek()
    }

    art.on('video:loadedmetadata', handleLoadedMetadata)
    if (art.video.readyState >= 1) {
      maybeSeek()
    }

    return () => {
      art.off('video:loadedmetadata', handleLoadedMetadata)
    }
  }, [resumeAt, shouldInit])

  useEffect(() => {
    const art = artRef.current
    if (!art || !shouldInit) return

    const next = subtitleUrl?.trim() ?? ''
    if (DEBUG) {
      console.info('[ArtPlayerVideo] subtitle update', {
        hasSubtitle: Boolean(next),
        url: next || null,
      })
    }

    const apply = async () => {
      if (!next) {
        lastAssUrlRef.current = null
        if (assRef.current) {
          assRef.current.dispose()
          assRef.current = null
        }
        return
      }

      if (lastAssUrlRef.current === next) {
        return
      }

      try {
        const libassWorkerUrl = toAbsoluteUrl('/libass-wasm/subtitles-octopus-worker.js')
        const libassWasmUrl = toAbsoluteUrl('/libass-wasm/subtitles-octopus-worker.wasm')
        const fallbackFontUrl = toAbsoluteUrl('/jassub/NotoSansSC.ttf')
        const subtitleTargetUrl = toAbsoluteUrl(next)

        if (!workerBlobUrlRef.current) {
          workerBlobUrlRef.current = await loadLibassWorker({
            workerUrl: libassWorkerUrl,
            wasmUrl: libassWasmUrl,
          })
        }

        // libass-wasm worker crashes if subUrl is undefined; OpenList passes subUrl at init.
        if (assRef.current) {
          assRef.current.dispose()
          assRef.current = null
        }

        const instance = new SubtitlesOctopus({
          workerUrl: workerBlobUrlRef.current,
          fallbackFont: fallbackFontUrl,
          availableFonts: {},
          video: art.video,
          subUrl: subtitleTargetUrl,
        })
        assRef.current = instance

        // Ensure overlay on top of video.
        const { video } = art
        const parent = video.parentElement
        if (parent && !parent.style.position) {
          parent.style.position = 'relative'
        }

        if (parent && !parent.style.overflow) {
          parent.style.overflow = 'hidden'
        }

        if (instance.canvasParent) {
          instance.canvasParent.className = 'artplayer-plugin-ass'
          instance.canvasParent.style.cssText = `
            position: absolute;
            inset: 0;
            width: 100%;
            height: 100%;
            user-select: none;
            pointer-events: none;
            z-index: 20;
          `

          if (parent && instance.canvasParent.parentElement !== parent) {
            parent.append(instance.canvasParent)
          }
        }

        lastAssUrlRef.current = next
      } catch (error) {
        console.error('[ArtPlayerVideo] libass init failed', {
          error: error instanceof Error ? error.message : String(error),
        })
      }
    }

    void apply()
  }, [shouldInit, subtitleUrl])

  return <div ref={containerRef} className={className} />
}

ArtPlayerVideo.displayName = 'ArtPlayerVideo'
