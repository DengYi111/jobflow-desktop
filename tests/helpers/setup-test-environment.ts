import fs from 'node:fs'
import path from 'node:path'
import { assertIsolatedDataPath } from './assert-isolated-data-path'

const temporaryDataRoot = path.resolve(process.cwd(), 'tmp', 'isolated-test-data')
assertIsolatedDataPath(temporaryDataRoot, process.env.JOBFLOW_DATA_DIRECTORY)
fs.mkdirSync(temporaryDataRoot, { recursive: true })
process.env.TEMP = temporaryDataRoot
process.env.TMP = temporaryDataRoot
