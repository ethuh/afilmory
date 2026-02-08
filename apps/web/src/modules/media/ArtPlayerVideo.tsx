import Artplayer from 'artplayer'
import { useEffect, useRef } from 'react'

interface ArtPlayerVideoProps {
  url: string
  poster?: string
  active: boolean
  muted: boolean
  volume: number
  fit: 'contain' | 'cover'
  resumeAt?: number
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
  className,
  onVideoElementChange,
}: ArtPlayerVideoProps) => {
  const containerRef = useRef<HTMLDivElement | null>(null)
  const artRef = useRef<Artplayer | null>(null)
  const hasAppliedResumeRef = useRef(false)
  const latestInitRef = useRef({ url, poster, muted, volume, fit })

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
      return
    }

    if (artRef.current) return

    const init = latestInitRef.current

    Artplayer.REMOVE_SRC_WHEN_DESTROY = true
    const art = new Artplayer({
      container,
      url: init.url,
      poster: init.poster,
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
          onSelect (item) {
            this.subtitle.show = Boolean(item.value)
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
      autoSize: true,
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

    return () => {
      if (artRef.current === art) {
        art.destroy()
        artRef.current = null
      }
      onVideoElementChange?.(null)
      hasAppliedResumeRef.current = false
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

  return <div ref={containerRef} className={className} />
}

ArtPlayerVideo.displayName = 'ArtPlayerVideo'
