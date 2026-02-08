export type OpenListScanConfig = {
  /**
   * Base URL of your OpenList instance.
   * Example: https://alist.example.com
   */
  baseUrl: string

  /**
   * OpenList account for API login (no 2FA).
   * Recommended: keep secrets in env instead of committing.
   */
  username: string
  password: string

  /**
   * Roots to recursively scan for photos/videos.
   * These should include the mount name as the first segment.
   * Example: /aaaa/DCIM  or  /bbbb/Photos
   */
  photoRoots: string[]
  videoRoots: string[]

  /**
   * Pagination for /api/fs/list.
   * OpenList per_page max is typically 100.
   */
  perPage: number

  /**
   * Pass refresh=true to force refresh OpenList cache.
   */
  refresh: boolean

  /**
   * Optional directory passwords for protected folders.
   * Key should be a full path (including mount), e.g. /aaaa/Secret.
   */
  pathPasswords?: Record<string, string>
}

export const openlistConfig: OpenListScanConfig = {
  baseUrl: 'https://alist.example.com',
  username: process.env.OPENLIST_USERNAME ?? '',
  password: process.env.OPENLIST_PASSWORD ?? '',
  photoRoots: ['/aaaa/DCIM', '/bbbb/Photos'],
  videoRoots: ['/aaaa/Videos', '/bbbb/ASMR'],
  perPage: 100,
  refresh: false,
  // pathPasswords: {
  //   '/aaaa/Secret': 'folder-password',
  // },
}
