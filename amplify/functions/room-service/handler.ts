import { createDynamoStore } from './store'
import { createRoomService, publicError, ServiceError } from './service'

interface Event {
  info: { fieldName: string }
  arguments: Record<string, unknown>
  identity?: { sub?: string }
}
let service: ReturnType<typeof createRoomService> | undefined

export async function handler(event: Event) {
  try {
    // Identity comes from AppSync/Cognito, never from user input or an AI tool argument.
    if (!event.identity?.sub) throw new ServiceError('UNAUTHENTICATED', '로그인이 필요합니다.')
    const tableName = process.env.TRAVEL_TABLE_NAME
    if (!tableName) throw new Error('Missing table configuration')
    service ??= createRoomService(createDynamoStore(tableName))
    const result = await service.execute(event.info.fieldName, event.arguments, { userId: event.identity.sub })
    if (event.info.fieldName === 'listMyRooms' || event.info.fieldName === 'getRoomState') return JSON.stringify(result)
    if (result && typeof result === 'object' && 'data' in result) return { ...result, data: JSON.stringify(result.data) }
    return result
  } catch (error) {
    const safe = publicError(error)
    if (safe.message.startsWith('INTERNAL:')) console.error('Room operation failed', {
      operation: event.info?.fieldName, errorName: error instanceof Error ? error.name : 'UnknownError',
    })
    throw safe
  }
}
