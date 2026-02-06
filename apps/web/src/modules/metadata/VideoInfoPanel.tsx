import '~/modules/viewer/PhotoViewer.css'

import { MotionButtonBase, ScrollArea } from '@afilmory/ui'
import { Spring } from '@afilmory/utils'
import { useQuery } from '@tanstack/react-query'
import { m } from 'motion/react'
import type { FC } from 'react'
import { useCallback, useMemo } from 'react'
import { useTranslation } from 'react-i18next'

import { useMobile } from '~/hooks/useMobile'
import { getFileExtension, probeViaServer, probeViaVideoElement } from '~/lib/video-tech-info'
import type { VideoManifestItem } from '~/types/media'

import { Row } from './formatExifData'

export interface VideoInfoPanelProps {
  currentVideo: VideoManifestItem
  onClose?: () => void
  visible?: boolean
}

export const VideoInfoPanel: FC<VideoInfoPanelProps> = ({ currentVideo, onClose, visible = true }) => {
  const { t } = useTranslation()
  const isMobile = useMobile()

  return (
    <m.div
      className={`${
        isMobile
          ? 'exif-panel-mobile fixed right-0 bottom-0 left-0 z-10 max-h-[60vh] w-full rounded-t-2xl backdrop-blur-2xl'
          : 'relative w-80 shrink-0 backdrop-blur-2xl'
      } border-accent/20 flex flex-col text-white`}
      initial={{
        opacity: 0,
        ...(isMobile ? { y: 100 } : { x: 100 }),
      }}
      animate={{
        opacity: visible ? 1 : 0,
        ...(isMobile ? { y: visible ? 0 : 100 } : { x: visible ? 0 : 100 }),
      }}
      exit={{
        opacity: 0,
        ...(isMobile ? { y: 100 } : { x: 100 }),
      }}
      transition={Spring.presets.smooth}
      style={{
        pointerEvents: visible ? 'auto' : 'none',
        backgroundImage:
          'linear-gradient(to bottom right, rgba(var(--color-materialMedium)), rgba(var(--color-materialThick)), transparent)',
        boxShadow:
          '0 8px 32px color-mix(in srgb, var(--color-accent) 8%, transparent), 0 4px 16px color-mix(in srgb, var(--color-accent) 6%, transparent), 0 2px 8px rgba(0, 0, 0, 0.1)',
      }}
    >
      {/* Inner glow layer */}
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            'linear-gradient(to bottom right, color-mix(in srgb, var(--color-accent) 5%, transparent), transparent, color-mix(in srgb, var(--color-accent) 5%, transparent))',
        }}
      />

      <div className="relative z-10 mb-4 flex shrink-0 items-center justify-between p-4 pb-0">
        <h3 className={`${isMobile ? 'text-base' : 'text-lg'} font-semibold`}>{t('inspector.tab.info')}</h3>
        {isMobile && onClose && (
          <button
            type="button"
            className="glassmorphic-btn border-accent/20 flex size-6 items-center justify-center rounded-full border text-white/70 duration-200 hover:text-white"
            onClick={onClose}
          >
            <i className="i-mingcute-close-line text-sm" />
          </button>
        )}
      </div>

      <VideoInfoPanelContent currentVideo={currentVideo} visible={visible} />
    </m.div>
  )
}

export const VideoInfoPanelContent: FC<{
  currentVideo: VideoManifestItem
  visible?: boolean
  onTagClick?: (tag: string) => void
  rootClassName?: string
  viewportClassName?: string
}> = ({
  currentVideo,
  visible = true,
  onTagClick,
  rootClassName = 'flex-1 min-h-0 overflow-auto lg:overflow-hidden',
  viewportClassName = 'px-4 pb-4 **:select-text',
}) => {
  const { t, i18n } = useTranslation()
  const isMobile = useMobile()

  const ext = useMemo(
    () => getFileExtension(currentVideo.s3Key || currentVideo.videoUrl),
    [currentVideo.s3Key, currentVideo.videoUrl],
  )

  const needTechInfo = currentVideo.durationMs == null || !(currentVideo.width > 0) || !(currentVideo.height > 0)

  const { data: tech, isPending } = useQuery({
    queryKey: ['video-tech-info', currentVideo.id, currentVideo.videoUrl],
    enabled: visible && needTechInfo,
    staleTime: 1000 * 60 * 60,
    queryFn: async () => {
      const isBrowserProbe = ext === 'mp4' || ext === 'webm'

      if (isBrowserProbe) {
        try {
          return await probeViaVideoElement(currentVideo.videoUrl)
        } catch {
          return await probeViaServer(currentVideo.videoUrl)
        }
      }

      return await probeViaServer(currentVideo.videoUrl)
    },
  })

  const durationMs = currentVideo.durationMs ?? tech?.durationMs ?? null
  const width = currentVideo.width > 0 ? currentVideo.width : (tech?.width ?? null)
  const height = currentVideo.height > 0 ? currentVideo.height : (tech?.height ?? null)

  const formattedDateTaken = useMemo(() => {
    const date = new Date(currentVideo.dateTaken)
    if (Number.isNaN(date.getTime())) return currentVideo.dateTaken
    return new Intl.DateTimeFormat(i18n.language, {
      dateStyle: 'short',
      timeStyle: 'medium',
    }).format(date)
  }, [currentVideo.dateTaken, i18n.language])

  const handleTagClick = useCallback(
    (tag: string) => {
      if (onTagClick) {
        onTagClick(tag)
        return
      }
      window.open(`/?tags=${tag}`, '_blank', 'noopener,noreferrer')
    },
    [onTagClick],
  )

  const durationValue = durationMs != null ? formatDuration(durationMs) : isPending ? '...' : t('exif.not.available')
  const dimensionsValue = width && height ? `${width} × ${height}` : t('exif.not.available')
  const formatValue = ext || t('exif.not.available')
  const fileSizeValue = `${(currentVideo.size / 1024 / 1024).toFixed(1)}MB`

  return (
    <ScrollArea mask rootClassName={rootClassName} viewportClassName={viewportClassName}>
      <div className={`space-y-${isMobile ? '3' : '4'}`}>
        <div>
          <h4 className="mb-2 text-sm font-medium text-white/80">{t('exif.basic.info')}</h4>
          <div className="space-y-1 text-sm">
            <Row label={t('exif.filename')} value={currentVideo.title} ellipsis={true} />
            <Row label={t('exif.format')} value={formatValue} />
            <Row label={t('exif.dimensions')} value={dimensionsValue} />
            <Row label={t('video.info.duration')} value={durationValue} />
            <Row label={t('exif.file.size')} value={fileSizeValue} />
            {formattedDateTaken && <Row label={t('exif.capture.time')} value={formattedDateTaken} />}
          </div>

          {currentVideo.tags && currentVideo.tags.length > 0 && (
            <div className="mt-3 mb-3">
              <h4 className="mb-2 text-sm font-medium text-white/80">{t('exif.tags')}</h4>
              <div className="-ml-1 flex flex-wrap gap-1.5">
                {currentVideo.tags.map((tag) => (
                  <MotionButtonBase
                    type="button"
                    onClick={() => handleTagClick(tag)}
                    key={tag}
                    className="glassmorphic-btn border-accent/20 bg-accent/10 inline-flex cursor-pointer items-center rounded-full border px-2 py-1 text-xs text-white/90 backdrop-blur-sm"
                  >
                    {tag}
                  </MotionButtonBase>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </ScrollArea>
  )
}

function formatDuration(durationMs: number) {
  const totalSeconds = Math.max(0, Math.floor(durationMs / 1000))
  const hours = Math.floor(totalSeconds / 3600)
  const minutes = Math.floor((totalSeconds % 3600) / 60)
  const seconds = totalSeconds % 60

  if (hours > 0) {
    return `${hours}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`
  }
  return `${minutes}:${String(seconds).padStart(2, '0')}`
}
