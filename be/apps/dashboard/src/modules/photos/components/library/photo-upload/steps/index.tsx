import { useEffect, useRef } from 'react'
import { toast } from 'sonner'
import { useShallow } from 'zustand/shallow'

import { usePhotoUploadStore } from '../store'
import type { WorkflowPhase } from '../types'
import { CompletedStep } from './CompletedStep'
import { ErrorStep } from './ErrorStep'
import { ProcessingStep } from './ProcessingStep'
import { ReviewStep } from './ReviewStep'
import { UploadingStep } from './UploadingStep'

const STEP_COMPONENTS: Record<WorkflowPhase, () => React.JSX.Element> = {
  review: ReviewStep,
  uploading: UploadingStep,
  processing: ProcessingStep,
  completed: CompletedStep,
  error: ErrorStep,
}

export function PhotoUploadSteps() {
  const { phase, errorMessage } = usePhotoUploadStore(
    useShallow((state) => ({
      phase: state.phase,
      errorMessage: state.uploadError ?? state.processingError,
    })),
  )
  const lastErrorRef = useRef<string | null>(null)

  useEffect(() => {
    if (phase === 'error' && errorMessage && lastErrorRef.current !== errorMessage) {
      toast.error('上传失败', { description: errorMessage })
      lastErrorRef.current = errorMessage
      return
    }
    if (phase !== 'error') {
      lastErrorRef.current = null
    }
  }, [phase, errorMessage])

  const StepComponent = STEP_COMPONENTS[phase] ?? ReviewStep
  return <StepComponent />
}
