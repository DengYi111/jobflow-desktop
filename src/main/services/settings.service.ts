export interface SettingsServiceOptions {
  dataDirectory: string
  version: string
  openDirectory: (directory: string) => Promise<void>
}

export function createSettingsService(options: SettingsServiceOptions) {
  return {
    getInfo() {
      return { dataDirectory: options.dataDirectory, version: options.version }
    },
    openDataDirectory() {
      return options.openDirectory(options.dataDirectory)
    },
  }
}
