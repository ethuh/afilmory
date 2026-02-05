import type { CameraInfo, LensInfo, MediaManifestItem, PhotoManifestItem, VideoManifestItem } from '@afilmory/builder'

const isVideoManifestItem = (item: MediaManifestItem): item is VideoManifestItem => item.kind === 'video'
const isPhotoManifestItem = (item: MediaManifestItem): item is PhotoManifestItem => !isVideoManifestItem(item)

class MediaLoader {
  private media: MediaManifestItem[] = []
  private mediaMap: Record<string, MediaManifestItem> = {}
  private photos: PhotoManifestItem[] = []
  private videos: VideoManifestItem[] = []
  private photoMap: Record<string, PhotoManifestItem> = {}
  private cameras: CameraInfo[] = []
  private lenses: LensInfo[] = []

  constructor() {
    this.getAllTags = this.getAllTags.bind(this)
    this.getAllCameras = this.getAllCameras.bind(this)
    this.getAllLenses = this.getAllLenses.bind(this)
    this.getMedia = this.getMedia.bind(this)
    this.getItem = this.getItem.bind(this)
    this.getPhotos = this.getPhotos.bind(this)
    this.getVideos = this.getVideos.bind(this)
    this.getPhoto = this.getPhoto.bind(this)

    this.media = __MANIFEST__.data as unknown as MediaManifestItem[]
    this.photos = this.media.filter(isPhotoManifestItem)
    this.videos = this.media.filter(isVideoManifestItem)
    this.cameras = __MANIFEST__.cameras as unknown as CameraInfo[]
    this.lenses = __MANIFEST__.lenses as unknown as LensInfo[]

    this.media.forEach((item) => {
      this.mediaMap[item.id] = item
      if (isPhotoManifestItem(item)) {
        this.photoMap[item.id] = item
      }
    })
  }

  getMedia() {
    return this.media
  }

  getItem(id: string) {
    return this.mediaMap[id]
  }

  getPhotos() {
    return this.photos
  }

  getVideos() {
    return this.videos
  }

  getPhoto(id: string) {
    return this.photoMap[id]
  }

  getAllTags() {
    const tagSet = new Set<string>()
    this.photos.forEach((photo) => {
      photo.tags.forEach((tag) => tagSet.add(tag))
    })
    return Array.from(tagSet).sort()
  }

  getAllCameras() {
    return this.cameras
  }

  getAllLenses() {
    return this.lenses
  }
}

export const mediaLoader = new MediaLoader()

// Backward-compat wrapper for older imports
export const photoLoader = {
  getAllTags: () => mediaLoader.getAllTags(),
  getAllCameras: () => mediaLoader.getAllCameras(),
  getAllLenses: () => mediaLoader.getAllLenses(),
  getPhotos: () => mediaLoader.getPhotos(),
  getPhoto: (id: string) => mediaLoader.getPhoto(id),
}
