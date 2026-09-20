import { readFileSync } from 'node:fs'
import { runInNewContext } from 'node:vm'
import assert from 'node:assert/strict'
import { test } from 'node:test'

function resolver() {
  let filter: unknown
  const source = readFileSync(new URL('../amplify/data/on-room-event.js', import.meta.url), 'utf8')
    .replace(/^import .*\n/m, '').replaceAll('export function', 'function')
  const handlers = runInNewContext(`${source}\n({request, response})`, {
    util: {
      unauthorized() { throw new Error('Unauthorized') },
      error(message: string) { throw new Error(message) },
      dynamodb: { toMapValues: (value: unknown) => value },
      transform: { toSubscriptionFilter: (value: unknown) => value },
    },
    extensions: { setSubscriptionFilter(value: unknown) { filter = value } },
  })
  return { handlers, filter: () => filter }
}

test('subscription checks authenticated membership key, not user-supplied identity', () => {
  const { handlers } = resolver()
  const request = handlers.request({ identity: { sub: 'alice' }, args: { roomId: 'room-a', userId: 'bob' } })
  assert.equal(request.operation, 'GetItem')
  assert.equal(request.key.pk, 'ROOM#room-a')
  assert.equal(request.key.sk, 'MEMBER#alice')
  assert.equal(request.consistentRead, true)
  assert.throws(() => handlers.request({ args: { roomId: 'room-a' } }), /Unauthorized/)
})
test('subscription rejects non-members and enforces the room filter for members', () => {
  const { handlers, filter } = resolver()
  assert.throws(() => handlers.response({ result: null, args: { roomId: 'room-a' } }), /Unauthorized/)
  assert.equal(handlers.response({ result: { pk: 'ROOM#room-a' }, args: { roomId: 'room-a' } }), null)
  assert.equal(JSON.stringify(filter()), JSON.stringify({ roomId: { eq: 'room-a' } }))
})
