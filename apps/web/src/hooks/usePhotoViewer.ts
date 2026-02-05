import { mediaLoader } from '@afilmory/data'
import { atom, useAtom, useAtomValue } from 'jotai'
import { use, useCallback, useMemo } from 'react'

import { gallerySettingAtom } from '~/atoms/app'
import { jotaiStore } from '~/lib/jotai'
import { trackView } from '~/lib/tracker'
import { PhotosContext } from '~/providers/photos-provider'
import type { MediaManifest, PhotoManifest, VideoManifestItem } from '~/types/media'

const openAtom = atom(false)
const currentIndexAtom = atom(0)
const triggerElementAtom = atom<HTMLElement | null>(null)

const isVideoManifestItem = (item: MediaManifest): item is VideoManifestItem => item.kind === 'video'
const isPhotoManifestItem = (item: MediaManifest): item is PhotoManifest => !isVideoManifestItem(item)

const data = mediaLoader.getMedia() as unknown as MediaManifest[]

// 抽取媒体筛选和排序逻辑为独立函数
const filterAndSortMedia = (
  selectedTags: string[],
  selectedCameras: string[],
  selectedLenses: string[],
  selectedRatings: number | null,
  sortOrder: 'asc' | 'desc',
  tagFilterMode: 'union' | 'intersection' = 'union',
) => {
  // 根据 tags、cameras、lenses 和 ratings 筛选
  let filteredMedia = data

  // Tags 筛选：根据模式进行并集或交集筛选
  if (selectedTags.length > 0) {
    filteredMedia = filteredMedia.filter((photo) => {
      if (tagFilterMode === 'intersection') {
        // 交集模式：照片必须包含所有选中的标签
        return selectedTags.every((tag) => photo.tags.includes(tag))
      } else {
        // 并集模式：照片必须包含至少一个选中的标签
        return selectedTags.some((tag) => photo.tags.includes(tag))
      }
    })
  }

  // Cameras 筛选：照片的相机必须匹配选中的相机之一
  if (selectedCameras.length > 0) {
    filteredMedia = filteredMedia.filter((item) => {
      if (!isPhotoManifestItem(item)) return false
      if (!item.exif?.Make || !item.exif?.Model) return false
      const cameraDisplayName = `${item.exif.Make.trim()} ${item.exif.Model.trim()}`
      return selectedCameras.includes(cameraDisplayName)
    })
  }

  // Lenses 筛选：照片的镜头必须匹配选中的镜头之一
  if (selectedLenses.length > 0) {
    filteredMedia = filteredMedia.filter((item) => {
      if (!isPhotoManifestItem(item)) return false
      if (!item.exif?.LensModel) return false
      const lensModel = item.exif.LensModel.trim()
      const lensMake = item.exif.LensMake?.trim()
      const lensDisplayName = lensMake ? `${lensMake} ${lensModel}` : lensModel
      return selectedLenses.includes(lensDisplayName)
    })
  }

  // Ratings 筛选：照片的评分必须大于等于选中的最小阈值
  if (selectedRatings !== null) {
    filteredMedia = filteredMedia.filter((item) => {
      if (!isPhotoManifestItem(item)) return false
      if (!item.exif?.Rating) return false
      return item.exif.Rating >= selectedRatings
    })
  }

  // 然后排序
  const getSortDateStr = (item: MediaManifest) => {
    if (isPhotoManifestItem(item) && item.exif?.DateTimeOriginal) {
      return item.exif.DateTimeOriginal as unknown as string
    }
    return item.dateTaken || item.lastModified
  }

  const sorted = filteredMedia.toSorted((a, b) => {
    const aDateStr = getSortDateStr(a)
    const bDateStr = getSortDateStr(b)
    return sortOrder === 'asc' ? aDateStr.localeCompare(bDateStr) : bDateStr.localeCompare(aDateStr)
  })

  return sorted
}

// 提供一个 getter 函数供非 UI 组件使用
export const getFilteredPhotos = () => {
  // 直接从 jotaiStore 中读取当前状态
  const currentGallerySetting = jotaiStore.get(gallerySettingAtom)
  return filterAndSortMedia(
    currentGallerySetting.selectedTags,
    currentGallerySetting.selectedCameras,
    currentGallerySetting.selectedLenses,
    currentGallerySetting.selectedRatings,
    currentGallerySetting.sortOrder,
    currentGallerySetting.tagFilterMode,
  )
}

export const usePhotos = () => {
  const { sortOrder, selectedTags, selectedCameras, selectedLenses, selectedRatings, tagFilterMode } =
    useAtomValue(gallerySettingAtom)

  const masonryItems = useMemo(() => {
    return filterAndSortMedia(selectedTags, selectedCameras, selectedLenses, selectedRatings, sortOrder, tagFilterMode)
  }, [sortOrder, selectedTags, selectedCameras, selectedLenses, selectedRatings, tagFilterMode])

  return masonryItems
}

export const useContextPhotos = () => {
  const photos = use(PhotosContext)
  if (!photos) {
    throw new Error('PhotosContext is not initialized')
  }
  return photos
}

export const usePhotoViewer = () => {
  const photos = usePhotos()
  const [isOpen, setIsOpen] = useAtom(openAtom)
  const [currentIndex, setCurrentIndex] = useAtom(currentIndexAtom)
  const [triggerElement, setTriggerElement] = useAtom(triggerElementAtom)

  const openViewer = useCallback(
    (index: number, element?: HTMLElement) => {
      const targetId = photos[index]?.id
      setCurrentIndex(index)
      setTriggerElement(element || null)
      setIsOpen(true)
      // 防止背景滚动
      document.body.style.overflow = 'hidden'

      if (targetId) {
        trackView(targetId)
      }
    },
    [photos, setCurrentIndex, setIsOpen, setTriggerElement],
  )

  const closeViewer = useCallback(() => {
    setIsOpen(false)
    setTriggerElement(null)
    // 恢复背景滚动
    document.body.style.overflow = ''
  }, [setIsOpen, setTriggerElement])

  const goToIndex = useCallback(
    (index: number) => {
      if (index >= 0 && index < photos.length) {
        setCurrentIndex(index)
        trackView(photos[index].id)
      }
    },
    [photos, setCurrentIndex],
  )

  return {
    isOpen,
    currentIndex,
    triggerElement,
    openViewer,
    closeViewer,

    goToIndex,
  }
}
