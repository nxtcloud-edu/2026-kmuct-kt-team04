import { type ClientSchema, a, defineData } from '@aws-amplify/backend'
import { roomService } from '../functions/room-service/resource'

const mutation = () => a.mutation()
  .arguments({ input: a.json().required() })
  .returns(a.ref('RoomEvent'))
  .authorization(allow => [allow.authenticated()])
  .handler(a.handler.function(roomService))

const schema = a.schema({
  RoomEvent: a.customType({
    roomId: a.id().required(), eventId: a.id().required(), entityType: a.string().required(),
    entityId: a.string().required(), action: a.string().required(), occurredAt: a.datetime().required(),
    data: a.json().required(),
  }),
  RoomInvite: a.customType({
    roomId: a.id().required(), inviteToken: a.string().required(), expiresAt: a.datetime().required(),
  }),
  createRoom: mutation(), updateRoom: mutation(), joinRoom: mutation(),
  createTimeBlock: mutation(), updateTimeBlock: mutation(), deleteTimeBlock: mutation(),
  createPin: mutation(), updatePin: mutation(), deletePin: mutation(), reorderPins: mutation(),
  createRoute: mutation(), updateRoute: mutation(), deleteRoute: mutation(), sendMessage: mutation(),
  createInvite: a.mutation().arguments({ roomId: a.id().required() })
    .returns(a.ref('RoomInvite')).authorization(allow => [allow.authenticated()])
    .handler(a.handler.function(roomService)),
  listMyRooms: a.query().returns(a.json())
    .authorization(allow => [allow.authenticated()]).handler(a.handler.function(roomService)),
  getRoomState: a.query().arguments({ roomId: a.id().required() }).returns(a.json())
    .authorization(allow => [allow.authenticated()]).handler(a.handler.function(roomService)),
  onRoomEvent: a.subscription()
    .for([a.ref('createRoom'), a.ref('updateRoom'), a.ref('joinRoom'), a.ref('createTimeBlock'), a.ref('updateTimeBlock'), a.ref('deleteTimeBlock'),
      a.ref('createPin'), a.ref('updatePin'), a.ref('deletePin'), a.ref('reorderPins'),
      a.ref('createRoute'), a.ref('updateRoute'), a.ref('deleteRoute'), a.ref('sendMessage')])
    .arguments({ roomId: a.id().required() })
    .authorization(allow => [allow.authenticated()])
    .handler(a.handler.custom({ entry: './on-room-event.js', dataSource: 'TravelTable' })),
})

export type Schema = ClientSchema<typeof schema>
export const data = defineData({ schema, authorizationModes: { defaultAuthorizationMode: 'userPool' } })
