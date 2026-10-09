import path from 'node:path'

function isSameOrInside(parent: string, candidate: string): boolean {
  const relative = path.win32
    .relative(path.win32.resolve(parent), path.win32.resolve(candidate))
    .toLocaleLowerCase()
  return (
    relative === '' ||
    (relative !== '..' && !relative.startsWith(`..${path.win32.sep}`) && !path.win32.isAbsolute(relative))
  )
}

export function assertIsolatedDataPath(candidate: string, activeDataDirectory?: string): void {
  const forbiddenDirectories = ['E:\\JobFlow\\Data', activeDataDirectory].filter((value): value is string =>
    Boolean(value),
  )
  if (forbiddenDirectories.some((directory) => isSameOrInside(directory, candidate))) {
    throw new Error(`测试数据路径不得指向正式资料目录：${candidate}`)
  }
}
