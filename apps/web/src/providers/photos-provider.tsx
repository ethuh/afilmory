import { createContext } from 'react'

import type { MediaManifest } from '~/types/media'

export const PhotosContext = createContext<MediaManifest[]>(null!)

export const PhotosProvider = ({ children, photos }: { children: React.ReactNode; photos: MediaManifest[] }) => {
  return <PhotosContext value={photos}>{children}</PhotosContext>
}
