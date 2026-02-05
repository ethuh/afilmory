import type { MediaManifestItem, PhotoManifestItem } from '@afilmory/builder'
import __MANIFEST__ from '@afilmory/data/manifest'

const isPhotoManifestItem = (item: MediaManifestItem): item is PhotoManifestItem => item.kind !== 'video'

class PhotoLoader {
  private photos: PhotoManifestItem[] = []
  private photoMap: Record<string, PhotoManifestItem> = {}

  constructor() {
    this.getAllTags = this.getAllTags.bind(this)
    this.getPhotos = this.getPhotos.bind(this)
    this.getPhoto = this.getPhoto.bind(this)

    const data = __MANIFEST__.data as unknown as MediaManifestItem[]
    this.photos = data.filter(isPhotoManifestItem)

    this.photos.forEach((photo) => {
      this.photoMap[photo.id] = photo
    })
  }

  getPhotos(ids?: string[]) {
    if (ids) {
      return this.photos.filter((photo) => ids.includes(photo.id))
    }
    return this.photos
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
}
export const photoLoader = new PhotoLoader()
