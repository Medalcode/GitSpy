jest.mock('ioredis', () => {
  const { Readable } = require('stream')

  class MockRedis {
    constructor() {}
    scanStream(opts: any) {
      const stream = new Readable({ objectMode: true, read() {} })
      // emit a single chunk of keys
      process.nextTick(() => {
        stream.push(['repositories:owner/repo', 'repositories:page:1:per:20'])
        stream.push(null)
      })
      return stream
    }
    pipeline() {
      const cmds: any[] = []
      return {
        del: (k: string) => { cmds.push(['del', k]); return this },
        exec: async () => cmds.map((c) => ['OK', c])
      }
    }
    on() {}
    get() { return null }
    set() {}
    del() {}
  }

  return MockRedis
})

import { delByPattern } from './cache'

describe('cache.delByPattern', () => {
  test('runs scanStream and pipeline without throwing', async () => {
    await expect(delByPattern('repositories:*')).resolves.toBeUndefined()
  })
})
