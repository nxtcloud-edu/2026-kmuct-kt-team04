import { mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import { dirname } from 'node:path'
import { ConflictError, type Key, type RecordItem, type Store, type Write } from '../amplify/functions/room-service/store'

/** Development-only persistence. Production continues to use DynamoDB. */
export async function createFileStore(path: string): Promise<Store> {
  let records = new Map<string, RecordItem>()
  try { records = new Map(JSON.parse(await readFile(path, 'utf8')) as [string, RecordItem][]) }
  catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error }
  const keyOf = (key: Key) => `${key.pk}|${key.sk}`
  let queue = Promise.resolve()
  return {
    async get(key) { await queue; return structuredClone(records.get(keyOf(key))) },
    async query(pk, prefix, limit, descending = false) {
      await queue
      const values = [...records.values()].filter(v => v.pk === pk && v.sk.startsWith(prefix))
        .sort((a, b) => a.sk.localeCompare(b.sk) * (descending ? -1 : 1))
      return structuredClone(limit ? values.slice(0, limit) : values)
    },
    async transact(writes: Write[]) {
      const transaction = queue.then(async () => {
        for (const write of writes) {
          const previous = records.get(keyOf(write.kind === 'put' ? write.item : write.key))
          if (write.kind === 'check' ? !previous : write.expected === 'absent' ? !!previous : previous?.version !== write.expected) throw new ConflictError()
        }
        const next = new Map(records)
        for (const write of writes) if (write.kind === 'put') next.set(keyOf(write.item), structuredClone(write.item))
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
