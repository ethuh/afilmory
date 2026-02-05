import { atom } from 'jotai'

// Hover-preview resume time (seconds) keyed by media id
export const mediaResumeTimeAtom = atom<Record<string, number>>({})

// User intent: whether sound is enabled for video playback
export const mediaSoundEnabledAtom = atom(false)

// Session volume preference (0..1)
export const mediaVolumeAtom = atom(1)
