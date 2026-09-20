import { defineFunction } from '@aws-amplify/backend'

export const roomService = defineFunction({
  name: 'room-service', entry: './handler.ts', timeoutSeconds: 30,
  resourceGroupName: 'data',
})
