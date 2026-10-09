import { describe, expect, it } from 'vitest'
import { assertIsolatedDataPath } from '../helpers/assert-isolated-data-path'

describe('test data isolation guard', () => {
  it('accepts in-memory and isolated temporary databases', () => {
    expect(() => assertIsolatedDataPath(':memory:')).not.toThrow()
    expect(() => assertIsolatedDataPath('E:\\WorkSpace\\tmp\\jobflow-test.sqlite')).not.toThrow()
  })

  it('rejects the live data directory and all of its descendants', () => {
    expect(() => assertIsolatedDataPath('E:\\JobFlow\\Data')).toThrow('测试数据路径不得指向正式资料目录')
    expect(() => assertIsolatedDataPath('E:\\JobFlow\\Data\\jobflow.sqlite')).toThrow(
      '测试数据路径不得指向正式资料目录',
    )
    expect(() => assertIsolatedDataPath('E:\\JobFlow\\Data-old\\jobflow.sqlite')).not.toThrow()
  })

  it('rejects the active user data folder when a test provides one', () => {
    expect(() => assertIsolatedDataPath('E:\\JobFlow\\Data\\resume.pdf', 'E:\\JobFlow\\Data\\')).toThrow()
  })
})
