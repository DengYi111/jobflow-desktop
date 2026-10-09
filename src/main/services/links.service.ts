export function createLinksService(open: (url: string) => Promise<void>) {
  return {
    async openExternal(value: string): Promise<void> {
      let url: URL
      try {
        url = new URL(value)
      } catch {
        throw new Error('无效的外部链接')
      }
      if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password)
        throw new Error('仅允许打开不含账号信息的 HTTP(S) 链接')
      await open(url.href)
    },
  }
}
