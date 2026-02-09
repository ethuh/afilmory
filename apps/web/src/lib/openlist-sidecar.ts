import { apiFetch } from '~/lib/api/http'

export type OpenListSidecarItem = {
  key: string
  fetchUrl: string
}

export type OpenListSidecarResult = {
  ass?: OpenListSidecarItem | null
  nfo?: OpenListSidecarItem | null
}

export async function getOpenListSidecar(key: string): Promise<OpenListSidecarResult> {
  const params = new URLSearchParams({ key })
  const url = `/api/openlist/sidecar?${params.toString()}`
  console.info('[openlist-sidecar] request', { key })
  try {
    const result = await apiFetch<OpenListSidecarResult>(url)
    console.info('[openlist-sidecar] response', {
      key,
      ass: result.ass?.key ?? null,
      nfo: result.nfo?.key ?? null,
    })
    return result
  } catch (error) {
    console.error('[openlist-sidecar] failed', {
      key,
      error: error instanceof Error ? error.message : String(error),
    })
    throw error
  }
}
