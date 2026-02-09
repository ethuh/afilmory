import { createEnv } from '@t3-oss/env-nextjs'
import { z } from 'zod'

export const env = createEnv({
  server: {
    PG_CONNECTION_STRING: z.string().min(1).optional(),
    OPENLIST_BASE_URL: z.string().min(1).optional(),
    OPENLIST_USERNAME: z.string().min(1).optional(),
    OPENLIST_PASSWORD: z.string().min(1).optional(),
  },
  runtimeEnv: {
    PG_CONNECTION_STRING: process.env.PG_CONNECTION_STRING,
    OPENLIST_BASE_URL: process.env.OPENLIST_BASE_URL,
    OPENLIST_USERNAME: process.env.OPENLIST_USERNAME,
    OPENLIST_PASSWORD: process.env.OPENLIST_PASSWORD,
  },
})
