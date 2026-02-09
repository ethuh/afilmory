import './PhotoViewer.css'
// Import Swiper styles
import 'swiper/css'
import 'swiper/css/navigation'

import { Thumbhash } from '@afilmory/ui'
import { Spring } from '@afilmory/utils'
import { useQuery } from '@tanstack/react-query'
import clsx from 'clsx'
import { useAtom, useAtomValue } from 'jotai'
import { AnimatePresence, m } from 'motion/react'
import { Fragment, Suspense, useCallback, useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { Swiper as SwiperType } from 'swiper'
import { Keyboard, Navigation, Virtual } from 'swiper/modules'
import { Swiper, SwiperSlide } from 'swiper/react'

import { mediaResumeTimeAtom, mediaSoundEnabledAtom, mediaVolumeAtom } from '~/atoms/media-playback'
import { useMobile } from '~/hooks/useMobile'
import { getOpenListSidecar } from '~/lib/openlist-sidecar'
import type { LoadingIndicatorRef } from '~/modules/inspector/LoadingIndicator'
import { LoadingIndicator } from '~/modules/inspector/LoadingIndicator'
import { PhotoInspector } from '~/modules/inspector/PhotoInspector'
import { VideoInspector } from '~/modules/inspector/VideoInspector'
import { ShareModal } from '~/modules/social/ShareModal'
import type { MediaManifest, PhotoManifest, VideoManifestItem } from '~/types/media'

import { ArtPlayerVideo } from '../media/ArtPlayerVideo'
import { ReactionRail } from '../social'
import { PhotoViewerTransitionPreview } from './animations/PhotoViewerTransitionPreview'
import { usePhotoViewerTransitions } from './animations/usePhotoViewerTransitions'
import { GalleryThumbnail } from './GalleryThumbnail'
import { ProgressiveImage } from './ProgressiveImage'

interface PhotoViewerProps {
  photos: MediaManifest[]
  currentIndex: number
  isOpen: boolean
  onClose: () => void
  onIndexChange: (index: number) => void
  triggerElement: HTMLElement | null
}

const isVideoManifestItem = (item: MediaManifest): item is VideoManifestItem => item.kind === 'video'
const isPhotoManifestItem = (item: MediaManifest): item is PhotoManifest => !isVideoManifestItem(item)

export const PhotoViewer = ({
  photos,
  currentIndex,
  isOpen,
  onClose,
  onIndexChange,
  triggerElement,
}: PhotoViewerProps) => {
  const { t } = useTranslation()
  const isMobile = useMobile()
  const swiperRef = useRef<SwiperType | null>(null)
  const [isImageZoomed, setIsImageZoomed] = useState(false)
  const [isInspectorVisible, setIsInspectorVisible] = useState(!isMobile)
  const [currentBlobSrc, setCurrentBlobSrc] = useState<string | null>(null)

  const [isWideMode, setIsWideMode] = useState(false)
  const [isWebFullscreenMode, setIsWebFullscreenMode] = useState(false)
  const [soundEnabled, setSoundEnabled] = useAtom(mediaSoundEnabledAtom)
  const [volume, setVolume] = useAtom(mediaVolumeAtom)
  const resumeTimes = useAtomValue(mediaResumeTimeAtom)

  const activeVideoRef = useRef<HTMLVideoElement | null>(null)

  const currentItem = photos[currentIndex]
  const isCurrentVideo = Boolean(currentItem && isVideoManifestItem(currentItem))
  const isCurrentPhoto = Boolean(currentItem && isPhotoManifestItem(currentItem))

  const {
    containerRef,
    entryTransition,
    exitTransition,
    isViewerContentVisible,
    isEntryAnimating,
    shouldRenderBackdrop,
    thumbHash: transitionThumbHash,
    shouldRenderThumbhash,
    handleEntryAnimationComplete,
    handleExitAnimationComplete,
  } = usePhotoViewerTransitions({
    isOpen,
    triggerElement,
    currentPhoto: currentItem,
    currentBlobSrc,
    isMobile,
  })

  useEffect(() => {
    if (!isOpen) {
      setIsImageZoomed(false)
      setIsInspectorVisible(!isMobile)
      setCurrentBlobSrc(null)
      setIsWideMode(false)
      setIsWebFullscreenMode(false)
      activeVideoRef.current = null
    }
  }, [isMobile, isOpen])

  useEffect(() => {
    if (!isOpen) return
    if (!currentItem) return
    setIsInspectorVisible(!isMobile)
    if (!isVideoManifestItem(currentItem)) {
      setIsWideMode(false)
      setIsWebFullscreenMode(false)
    }
  }, [currentItem, isMobile, isOpen])

  useEffect(() => {
    if (isWebFullscreenMode) {
      setIsInspectorVisible(false)
    }
  }, [isWebFullscreenMode])

  const handlePrevious = useCallback(() => {
    if (currentIndex > 0) {
      onIndexChange(currentIndex - 1)
      swiperRef.current?.slidePrev()
    }
  }, [currentIndex, onIndexChange])

  const handleNext = useCallback(() => {
    if (currentIndex < photos.length - 1) {
      onIndexChange(currentIndex + 1)
      swiperRef.current?.slideNext()
    }
  }, [currentIndex, photos.length, onIndexChange])

  // 同步 Swiper 的索引
  useEffect(() => {
    if (swiperRef.current && swiperRef.current.activeIndex !== currentIndex) {
      swiperRef.current.slideTo(currentIndex, 300)
    }
    // 切换图片时重置缩放状态
    setIsImageZoomed(false)
  }, [currentIndex])

  // 当图片缩放状态改变时，控制 Swiper 的触摸行为
  useEffect(() => {
    if (swiperRef.current) {
      if (isImageZoomed) {
        // 图片被缩放时，禁用 Swiper 的触摸滑动
        swiperRef.current.allowTouchMove = false
      } else {
        // 图片未缩放时，启用 Swiper 的触摸滑动
        swiperRef.current.allowTouchMove = true
      }
    }
  }, [isImageZoomed])

  const loadingIndicatorRef = useRef<LoadingIndicatorRef>(null)
  // 处理图片缩放状态变化
  const handleZoomChange = useCallback((isZoomed: boolean) => {
    setIsImageZoomed(isZoomed)
  }, [])

  // 处理 blobSrc 变化
  const handleBlobSrcChange = useCallback((blobSrc: string | null) => {
    setCurrentBlobSrc(blobSrc)
  }, [])

  // 键盘导航
  useEffect(() => {
    if (!isOpen) return

    const handleKeyDown = (event: KeyboardEvent) => {
      switch (event.key) {
        case 'ArrowLeft': {
          event.preventDefault()
          handlePrevious()
          break
        }
        case 'ArrowRight': {
          event.preventDefault()
          handleNext()
          break
        }
        case 'Escape': {
          event.preventDefault()
          onClose()
          break
        }
      }
    }

    document.addEventListener('keydown', handleKeyDown)
    return () => {
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [isOpen, handlePrevious, handleNext, onClose])

  const toggleFullscreen = useCallback(async () => {
    try {
      if (document.fullscreenElement) {
        await document.exitFullscreen()
        return
      }

      const container = containerRef.current
      if (container?.requestFullscreen) {
        await container.requestFullscreen()
        return
      }

      const videoEl = activeVideoRef.current as any
      if (typeof videoEl?.webkitEnterFullscreen === 'function') {
        videoEl.webkitEnterFullscreen()
      }
    } catch {
      // ignore
    }
  }, [activeVideoRef, containerRef])

  const enableSound = useCallback(() => {
    setSoundEnabled(true)
    const el = activeVideoRef.current
    if (el) {
      el.muted = false
      el.volume = volume
    }
  }, [setSoundEnabled, volume])

  const currentThumbHash = transitionThumbHash
  const currentPhoto = currentItem && isCurrentPhoto ? (currentItem as PhotoManifest) : null
  const currentVideo = currentItem && isCurrentVideo ? (currentItem as VideoManifestItem) : null

  const sidecarEnabled = Boolean(
    isOpen &&
    isViewerContentVisible &&
    isInspectorVisible &&
    currentVideo &&
    typeof currentVideo.s3Key === 'string' &&
    currentVideo.s3Key.length > 0,
  )

  const { data: sidecar } = useQuery({
    queryKey: ['video-sidecar', currentVideo?.s3Key],
    enabled: sidecarEnabled,
    staleTime: 1000 * 60 * 60,
    queryFn: async () => {
      console.info('[PhotoViewer] sidecar query', {
        key: currentVideo!.s3Key,
      })
      return await getOpenListSidecar(currentVideo!.s3Key)
    },
  })

  if (!currentItem) return null

  return (
    <>
      <AnimatePresence>
        {shouldRenderBackdrop && (
          <m.div
            key="photo-viewer-backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: isOpen ? 1 : 0 }}
            exit={{ opacity: 0 }}
            transition={Spring.presets.snappy}
            className="bg-material-opaque fixed inset-0"
          />
        )}
      </AnimatePresence>
      {/* 固定背景层防止透出 */}
      {/* 交叉溶解的 Blurhash 背景 */}
      <AnimatePresence mode="sync">
        {shouldRenderThumbhash && (
          <m.div
            key={`${currentItem.id}-thumbhash`}
            initial={{ opacity: 0 }}
            animate={{ opacity: isOpen ? 1 : 0 }}
            exit={{ opacity: 0 }}
            transition={Spring.presets.snappy}
            className="fixed inset-0"
          >
            {currentThumbHash && <Thumbhash thumbHash={currentThumbHash} className="size-fill scale-110" />}
          </m.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {isOpen && (
          <m.div
            ref={containerRef}
            className="fixed inset-0 z-50 flex items-center justify-center"
            style={{
              touchAction: isMobile ? 'manipulation' : 'none',
              pointerEvents: !isViewerContentVisible || isEntryAnimating ? 'none' : 'auto',
            }}
            initial={{ opacity: 0 }}
            animate={{ opacity: isViewerContentVisible ? 1 : 0 }}
            exit={{ opacity: 0 }}
            transition={Spring.presets.snappy}
          >
            <div className={`flex size-full ${isMobile ? 'flex-col' : 'flex-row'}`}>
              <div className="z-1 flex min-h-0 min-w-0 flex-1 flex-col">
                <m.div
                  className="group/photo-viewer relative flex min-h-0 min-w-0 flex-1"
                  animate={{ opacity: isViewerContentVisible ? 1 : 0 }}
                  transition={Spring.presets.snappy}
                >
                  {/* 顶部工具栏 */}
                  <m.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: isViewerContentVisible ? 1 : 0 }}
                    exit={{ opacity: 0 }}
                    transition={Spring.presets.snappy}
                    className={`pointer-events-none absolute ${isMobile ? 'top-2 right-2 left-2' : 'top-4 right-4 left-4'} z-30 flex items-center justify-between`}
                  >
                    {/* 左侧工具按钮 */}
                    <div className="flex items-center gap-2">
                      {/* 信息按钮 - 在移动设备上显示 */}
                      {isMobile && (
                        <button
                          type="button"
                          className={`bg-material-ultra-thick pointer-events-auto flex size-8 items-center justify-center rounded-full text-white backdrop-blur-2xl duration-200 hover:bg-black/40 ${isInspectorVisible ? 'bg-accent' : ''}`}
                          onClick={() => setIsInspectorVisible((visible) => !visible)}
                        >
                          <i className="i-mingcute-information-line" />
                        </button>
                      )}

                      {isCurrentVideo && (
                        <Fragment>
                          {!soundEnabled && (
                            <button
                              type="button"
                              className="bg-material-ultra-thick pointer-events-auto flex h-8 items-center gap-1 rounded-full px-3 text-white backdrop-blur-2xl duration-200 hover:bg-black/40"
                              onClick={enableSound}
                              title="Unmute"
                            >
                              <i className="i-lucide-volume-x text-sm" />
                              <span className="text-xs">Sound</span>
                            </button>
                          )}

                          <button
                            type="button"
                            className={clsx(
                              'bg-material-ultra-thick pointer-events-auto flex size-8 items-center justify-center rounded-full text-white backdrop-blur-2xl duration-200 hover:bg-black/40',
                              isWideMode && 'bg-accent',
                            )}
                            onClick={() => {
                              setIsWideMode((v) => !v)
                              setIsWebFullscreenMode(false)
                            }}
                            title="Widescreen"
                          >
                            <i className="i-lucide-rectangle-horizontal text-sm" />
                          </button>

                          <button
                            type="button"
                            className={clsx(
                              'bg-material-ultra-thick pointer-events-auto flex size-8 items-center justify-center rounded-full text-white backdrop-blur-2xl duration-200 hover:bg-black/40',
                              isWebFullscreenMode && 'bg-accent',
                            )}
                            onClick={() => {
                              setIsWebFullscreenMode((v) => !v)
                              setIsWideMode(false)
                            }}
                            title="Web Fullscreen"
                          >
                            <i className="i-lucide-maximize text-sm" />
                          </button>

                          <button
                            type="button"
                            className="bg-material-ultra-thick pointer-events-auto flex size-8 items-center justify-center rounded-full text-white backdrop-blur-2xl duration-200 hover:bg-black/40"
                            onClick={toggleFullscreen}
                            title="Fullscreen"
                          >
                            <i className="i-lucide-maximize-2 text-sm" />
                          </button>
                        </Fragment>
                      )}
                    </div>

                    {/* 右侧按钮组 */}
                    <div className="flex items-center gap-2">
                      {/* 分享按钮 */}
                      {isCurrentPhoto && (
                        <ShareModal
                          photo={currentItem as PhotoManifest}
                          blobSrc={currentBlobSrc || undefined}
                          trigger={
                            <button
                              type="button"
                              className="bg-material-ultra-thick pointer-events-auto flex size-8 items-center justify-center rounded-full text-white backdrop-blur-2xl duration-200 hover:bg-black/40"
                              title={t('photo.share.title')}
                            >
                              <i className="i-mingcute-share-2-line" />
                            </button>
                          }
                        />
                      )}

                      {/* 展开信息面板（桌面端在折叠时显示） */}
                      {!isMobile && !isInspectorVisible && (isCurrentPhoto || isCurrentVideo) && (
                        <button
                          type="button"
                          className="bg-material-ultra-thick pointer-events-auto flex size-8 items-center justify-center rounded-full text-white backdrop-blur-2xl duration-200 hover:bg-black/40"
                          onClick={() => setIsInspectorVisible(true)}
                          title={t('inspector.tab.info')}
                        >
                          <i className="i-lucide-panel-right-open" />
                        </button>
                      )}

                      {/* 关闭按钮 */}
                      <button
                        type="button"
                        className="bg-material-ultra-thick pointer-events-auto flex size-8 items-center justify-center rounded-full text-white backdrop-blur-2xl duration-200 hover:bg-black/40"
                        onClick={onClose}
                      >
                        <i className="i-mingcute-close-line" />
                      </button>
                    </div>
                  </m.div>

                  {/* 加载指示器 */}
                  <LoadingIndicator ref={loadingIndicatorRef} />
                  {/* Swiper 容器 */}
                  <Swiper
                    modules={[Navigation, Keyboard, Virtual]}
                    spaceBetween={0}
                    slidesPerView={1}
                    initialSlide={currentIndex}
                    virtual
                    noSwiping
                    noSwipingClass="swiper-no-swiping"
                    keyboard={{
                      enabled: true,
                      onlyInViewport: true,
                    }}
                    onSwiper={(swiper) => {
                      swiperRef.current = swiper
                      // 初始化时确保触摸滑动是启用的
                      swiper.allowTouchMove = !isImageZoomed
                    }}
                    onSlideChange={(swiper) => {
                      onIndexChange(swiper.activeIndex)
                    }}
                    className="h-full w-full"
                    style={{ touchAction: isMobile ? 'pan-x' : 'pan-y' }}
                  >
                    {photos.map((item, index) => {
                      const isCurrentSlide = index === currentIndex
                      const hideCurrentSlide = isEntryAnimating && isCurrentSlide
                      const isVideo = isVideoManifestItem(item)
                      const resumeAt = isVideo ? resumeTimes[item.id] : undefined

                      return (
                        <SwiperSlide key={item.id} className="flex items-center justify-center" virtualIndex={index}>
                          {!isVideo && <ReactionRail photoId={item.id} />}
                          <m.div
                            initial={{ opacity: 0.5, scale: 0.95 }}
                            animate={{ opacity: 1, scale: 1 }}
                            exit={{ opacity: 0, scale: 0.95 }}
                            transition={Spring.presets.smooth}
                            className="relative flex h-full w-full items-center justify-center"
                            style={{
                              visibility: hideCurrentSlide ? 'hidden' : 'visible',
                            }}
                          >
                            {isVideo ? (
                              <VideoSlide
                                video={item}
                                isCurrent={isCurrentSlide}
                                isOpen={isOpen && isViewerContentVisible}
                                resumeAt={resumeAt}
                                soundEnabled={soundEnabled}
                                volume={volume}
                                onVolumeChange={setVolume}
                                onSoundEnabledChange={setSoundEnabled}
                                onActiveVideoChange={(el) => {
                                  if (isCurrentSlide) {
                                    activeVideoRef.current = el
                                  }
                                }}
                                fit={isWideMode ? 'cover' : 'contain'}
                                subtitleUrl={isCurrentSlide ? (sidecar?.ass?.fetchUrl ?? null) : null}
                              />
                            ) : (
                              <ProgressiveImage
                                loadingIndicatorRef={loadingIndicatorRef}
                                isCurrentImage={isCurrentSlide}
                                src={(item as PhotoManifest).originalUrl}
                                thumbnailSrc={(item as PhotoManifest).thumbnailUrl}
                                alt={(item as PhotoManifest).title}
                                width={isCurrentSlide ? (item as PhotoManifest).width : undefined}
                                height={isCurrentSlide ? (item as PhotoManifest).height : undefined}
                                className="h-full w-full object-contain"
                                enablePan={isCurrentSlide ? !isMobile || isImageZoomed : true}
                                enableZoom={true}
                                shouldRenderHighRes={isViewerContentVisible && isOpen}
                                onZoomChange={isCurrentSlide ? handleZoomChange : undefined}
                                onBlobSrcChange={isCurrentSlide ? handleBlobSrcChange : undefined}
                                // Video source (Live Photo or Motion Photo)
                                videoSource={(() => {
                                  const photo = item as PhotoManifest
                                  const v = photo.video

                                  if (v?.type === 'motion-photo') {
                                    return {
                                      type: 'motion-photo' as const,
                                      imageUrl: photo.originalUrl,
                                      offset: v.offset,
                                      size: v.size,
                                      presentationTimestamp: v.presentationTimestamp,
                                    }
                                  }

                                  if (v?.type === 'live-photo') {
                                    return {
                                      type: 'live-photo' as const,
                                      videoUrl: v.videoUrl,
                                    }
                                  }

                                  return { type: 'none' as const }
                                })()}
                                shouldAutoPlayVideoOnce={isCurrentSlide}
                                // HDR props
                                isHDR={(item as PhotoManifest).isHDR}
                              />
                            )}
                          </m.div>
                        </SwiperSlide>
                      )
                    })}
                  </Swiper>

                  {/* 自定义导航按钮 */}

                  {!isMobile && (
                    <Fragment>
                      {currentIndex > 0 && (
                        <button
                          type="button"
                          className={`bg-material-medium absolute top-1/2 left-4 z-20 flex size-8 -translate-y-1/2 items-center justify-center rounded-full text-white opacity-0 backdrop-blur-sm duration-200 group-hover/photo-viewer:opacity-100 hover:bg-black/40`}
                          onClick={handlePrevious}
                        >
                          <i className={`i-mingcute-left-line text-xl`} />
                        </button>
                      )}

                      {currentIndex < photos.length - 1 && (
                        <button
                          type="button"
                          className={`bg-material-medium absolute top-1/2 right-4 z-20 flex size-8 -translate-y-1/2 items-center justify-center rounded-full text-white opacity-0 backdrop-blur-sm duration-200 group-hover/photo-viewer:opacity-100 hover:bg-black/40`}
                          onClick={handleNext}
                        >
                          <i className={`i-mingcute-right-line text-xl`} />
                        </button>
                      )}
                    </Fragment>
                  )}
                </m.div>

                {!isWebFullscreenMode && (
                  <Suspense>
                    <GalleryThumbnail
                      currentIndex={currentIndex}
                      photos={photos}
                      onIndexChange={onIndexChange}
                      visible={isViewerContentVisible}
                    />
                  </Suspense>
                )}
              </div>

              {/* PhotoInspector - 根据设备与折叠状态展示 */}

              <Suspense>
                <AnimatePresenceOnlyMobile>
                  {isInspectorVisible && isCurrentPhoto && currentPhoto && (
                    <PhotoInspector
                      currentPhoto={currentPhoto}
                      exifData={currentPhoto.exif}
                      visible={isInspectorVisible && isViewerContentVisible}
                      onClose={() => setIsInspectorVisible(false)}
                    />
                  )}
                  {isInspectorVisible && isCurrentVideo && currentVideo && (
                    <VideoInspector
                      currentVideo={currentVideo}
                      visible={isInspectorVisible && isViewerContentVisible}
                      onClose={() => setIsInspectorVisible(false)}
                    />
                  )}
                </AnimatePresenceOnlyMobile>
              </Suspense>
            </div>
          </m.div>
        )}
      </AnimatePresence>
      {entryTransition && (
        <PhotoViewerTransitionPreview
          key={`${entryTransition.variant}-${entryTransition.photoId}`}
          transition={entryTransition}
          onComplete={handleEntryAnimationComplete}
        />
      )}
      {exitTransition && (
        <PhotoViewerTransitionPreview
          key={`${exitTransition.variant}-${exitTransition.photoId}`}
          transition={exitTransition}
          onComplete={handleExitAnimationComplete}
        />
      )}
    </>
  )
}

const VideoSlide = ({
  video,
  isCurrent,
  isOpen,
  resumeAt,
  soundEnabled,
  volume,
  onVolumeChange,
  onSoundEnabledChange,
  onActiveVideoChange,
  fit,
  subtitleUrl,
}: {
  video: VideoManifestItem
  isCurrent: boolean
  isOpen: boolean
  resumeAt?: number
  soundEnabled: boolean
  volume: number
  onVolumeChange: (volume: number) => void
  onSoundEnabledChange: (enabled: boolean) => void
  onActiveVideoChange: (el: HTMLVideoElement | null) => void
  fit: 'contain' | 'cover'
  subtitleUrl?: string | null
}) => {
  const [videoEl, setVideoEl] = useState<HTMLVideoElement | null>(null)
  const shouldLoad = isCurrent && isOpen

  useEffect(() => {
    if (isCurrent) {
      onActiveVideoChange(videoEl)
      return () => {
        onActiveVideoChange(null)
      }
    }
    return
  }, [isCurrent, onActiveVideoChange, videoEl])

  useEffect(() => {
    const el = videoEl
    if (!el) return

    let raf = 0
    let pendingVolume: number | null = null
    let lastSentVolume: number | null = null

    const handleVolumeChange = () => {
      const nextEnabled = !el.muted
      if (nextEnabled !== soundEnabled) {
        onSoundEnabledChange(nextEnabled)
      }

      // Don't persist a 0 volume value that comes from muting.
      if (el.muted && el.volume === 0) {
        return
      }

      pendingVolume = el.volume
      if (raf) return
      raf = requestAnimationFrame(() => {
        raf = 0
        if (pendingVolume == null) return
        if (lastSentVolume == null || Math.abs(pendingVolume - lastSentVolume) > 0.005) {
          lastSentVolume = pendingVolume
          onVolumeChange(pendingVolume)
        }
      })
    }

    el.addEventListener('volumechange', handleVolumeChange)
    return () => {
      el.removeEventListener('volumechange', handleVolumeChange)
      if (raf) {
        cancelAnimationFrame(raf)
      }
    }
  }, [onSoundEnabledChange, onVolumeChange, soundEnabled, videoEl])

  return (
    <div className="relative flex h-full w-full items-center justify-center bg-black">
      <div className="swiper-no-swiping h-full w-full">
        <ArtPlayerVideo
          url={video.videoUrl}
          poster={video.thumbnailUrl}
          active={shouldLoad}
          muted={!soundEnabled}
          volume={volume}
          fit={fit}
          resumeAt={resumeAt}
          subtitleUrl={subtitleUrl}
          className="h-full w-full"
          onVideoElementChange={(el) => {
            setVideoEl(el)
          }}
        />
      </div>
    </div>
  )
}

const AnimatePresenceOnlyMobile = ({ children }: { children: React.ReactNode }) => {
  const isMobile = useMobile()
  if (!isMobile) return children
  return <AnimatePresence>{children}</AnimatePresence>
}
