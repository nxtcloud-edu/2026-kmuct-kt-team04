import { mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import { dirname } from 'node:path'
import { ConflictError, type Key, type RecordItem, type Store, type Write } from '../amplify/functions/room-service/store'

type Expected = 'absent' | 'exists' | 'unversioned' | number

/** Development-only persistence. Production continues to use DynamoDB. */
export async function createFileStore(path: string): Promise<Store> {
  let records = new Map<string, RecordItem>()
  try { records = new Map(JSON.parse(await readFile(path, 'utf8')) as [string, RecordItem][]) }
  catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error }
  const keyOf = (key: Key) => `${key.pk}|${key.sk}`
  const matches = (previous: RecordItem | undefined, expected: Expected) => {
    if (expected === 'absent') return !previous
    if (expected === 'exists') return Boolean(previous)
    if (expected === 'unversioned') return Boolean(previous) && previous?.version === undefined
    return previous?.version === expected
  }
  let queue = Promise.resolve()
  return {
    async get(key) { await queue; return structuredClone(records.get(keyOf(key))) },
    async query(pk, prefix, limit, descending = false) {
      await queue
      const values = [...records.values()].filter(value => value.pk === pk && value.sk.startsWith(prefix))
        .sort((a, b) => a.sk.localeCompare(b.sk) * (descending ? -1 : 1))
      return structuredClone(limit ? values.slice(0, limit) : values)
    },
    async transact(writes: Write[]) {
      const transaction = queue.then(async () => {
        for (const write of writes) {
          const key = write.kind === 'put' ? write.item : write.key
          const previous = records.get(keyOf(key))
          const valid = write.kind === 'check' ? Boolean(previous) : matches(previous, write.expected)
          if (!valid) throw new ConflictError()
        }
        const next = new Map(records)
        for (const write of writes) {
          if (write.kind === 'put') next.set(keyOf(write.item), structuredClone(write.item))
          if (write.kind === 'delete') next.delete(keyOf(write.key))
        }
        await mkdir(dirname(path), { recursive: true })
        await writeFile(`${path}.tmp`, JSON.stringify([...next]), { mode: 0o600 })
        await rename(`${path}.tmp`, path)
        records = next
      })
      queue = transaction.catch(() => {})
      await transaction
    },
  }
}
