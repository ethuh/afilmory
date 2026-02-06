import type { FC } from 'react'

import { injectConfig } from '~/config'
import { VideoInfoPanel } from '~/modules/metadata/VideoInfoPanel'
import type { VideoManifestItem } from '~/types/media'

import { VideoInspectorPanel } from './VideoInspectorPanel'

export interface VideoInspectorProps {
  currentVideo: VideoManifestItem
  visible?: boolean
  onClose?: () => void
}

const CloudInspector: FC<VideoInspectorProps> = (props) => <VideoInspectorPanel {...props} />
const LegacyInspector: FC<VideoInspectorProps> = (props) => <VideoInfoPanel {...props} />

export const VideoInspector: FC<VideoInspectorProps> = injectConfig.useCloud ? CloudInspector : LegacyInspector
