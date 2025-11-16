import { Button } from '@afilmory/ui'
import { useShallow } from 'zustand/shallow'

import { ProcessingPanel } from '../ProcessingPanel'
import { usePhotoUploadStore } from '../store'
import { UploadFileList } from '../UploadFileList'

export function ProcessingStep() {
  const { uploadEntries, progress, processingState, processingLogs } = usePhotoUploadStore(
    useShallow((state) => ({
      uploadEntries: state.uploadEntries,
      progress: state.totalSize === 0 ? 0 : Math.min(1, state.uploadedBytes / state.totalSize),
      processingState: state.processingState,
      processingLogs: state.processingLogs,
    })),
  )
  const abortCurrent = usePhotoUploadStore((state) => state.abortCurrent)

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <h2 className="text-text text-lg font-semibold">服务器处理进行中</h2>
        <p className="text-text-tertiary text-sm">已完成文件上传，正在同步元数据和缩略图，请稍候。</p>
      </div>

      <UploadFileList entries={uploadEntries} overallProgress={progress} />
      <ProcessingPanel state={processingState} logs={processingLogs} />

      <div className="flex items-center justify-end gap-2">
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={abortCurrent}
          className="text-rose-300 hover:text-rose-200"
        >
          停止处理
        </Button>
        <Button type="button" variant="primary" size="sm" disabled isLoading>
          服务器处理中...
        </Button>
      </div>
    </div>
  )
}
