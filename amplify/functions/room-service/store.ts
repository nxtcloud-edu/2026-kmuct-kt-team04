import { DynamoDBClient } from '@aws-sdk/client-dynamodb'
import { DynamoDBDocumentClient, GetCommand, QueryCommand, TransactWriteCommand } from '@aws-sdk/lib-dynamodb'

export interface Key { pk: string; sk: string }
export interface RecordItem extends Key { data: unknown; version?: number; ttl?: number }
export type Write =
  | { kind: 'put'; item: RecordItem; expected: 'absent' | number }
  | { kind: 'check'; key: Key }
export interface Store {
  get(key: Key): Promise<RecordItem | undefined>
  query(pk: string, prefix: string, limit?: number, descending?: boolean): Promise<RecordItem[]>
  transact(writes: Write[]): Promise<void>
}
export class ConflictError extends Error {
  constructor() { super('CONFLICT: 데이터가 변경됐습니다. 최신 내용을 불러온 뒤 다시 시도해 주세요.') }
}

export function createDynamoStore(tableName: string): Store {
  const client = DynamoDBDocumentClient.from(new DynamoDBClient({}), {
    marshallOptions: { removeUndefinedValues: true },
  })
  return {
    async get(key) {
      const result = await client.send(new GetCommand({ TableName: tableName, Key: key, ConsistentRead: true }))
      return result.Item as RecordItem | undefined
    },
    async query(pk, prefix, limit, descending = false) {
      const records: RecordItem[] = []
      let cursor: Record<string, unknown> | undefined
      do {
        const result = await client.send(new QueryCommand({
          TableName: tableName, KeyConditionExpression: 'pk = :pk AND begins_with(sk, :prefix)',
          ExpressionAttributeValues: { ':pk': pk, ':prefix': prefix }, ConsistentRead: true,
          ScanIndexForward: !descending, ExclusiveStartKey: cursor,
          ...(limit ? { Limit: limit - records.length } : {}),
        }))
        records.push(...(result.Items ?? []) as RecordItem[])
        cursor = result.LastEvaluatedKey
      } while (cursor && (!limit || records.length < limit))
      return records
    },
    async transact(writes) {
      try {
        await client.send(new TransactWriteCommand({
          TransactItems: writes.map(write => write.kind === 'check' ? {
            ConditionCheck: { TableName: tableName, Key: write.key, ConditionExpression: 'attribute_exists(pk)' },
          } : {
            Put: {
              TableName: tableName, Item: write.item,
              ConditionExpression: write.expected === 'absent' ? 'attribute_not_exists(pk)' : '#version = :version',
              ...(typeof write.expected === 'number' ? {
                ExpressionAttributeNames: { '#version': 'version' },
                ExpressionAttributeValues: { ':version': write.expected },
              } : {}),
            },
          }),
        }))
      } catch (error) {
        if (error instanceof Error && error.name === 'TransactionCanceledException'
          && 'CancellationReasons' in error && Array.isArray(error.CancellationReasons)
          && error.CancellationReasons.some(reason => reason?.Code === 'ConditionalCheckFailed')) {
          throw new ConflictError()
        }
        throw error
      }
    },
  }
}
