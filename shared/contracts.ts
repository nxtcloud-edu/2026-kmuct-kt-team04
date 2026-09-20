import { z } from 'zod'

export const idSchema = z.uuid()
const title = z.string().trim().min(1).max(100)
const description = z.string().trim().max(2000)
const date = z.iso.date()
const time = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/)
const requestId = idSchema
const participantCount = z.number().int().min(1).max(100)
const validDateRange = <T extends { startDate: string; endDate: string }>(value: T) => value.endDate >= value.startDate
const withinThirtyDays = <T extends { startDate: string; endDate: string }>(value: T) =>
  (Date.parse(value.endDate) - Date.parse(value.startDate)) / 86400000 < 30

export const createRoomInput = z.strictObject({
  name: title, destination: title, startDate: date, endDate: date,
  participantCount: participantCount.default(1),
  displayName: z.string().trim().min(1).max(40), requestId,
}).refine(validDateRange, '종료일은 시작일 이후여야 합니다.')
  .refine(withinThirtyDays, '여행은 최대 30일입니다.')
export const updateRoomInput = z.strictObject({
  roomId: idSchema, name: title, destination: title.optional(), startDate: date, endDate: date, participantCount,
  expectedVersion: z.number().int().positive(),
}).refine(validDateRange, '종료일은 시작일 이후여야 합니다.')
  .refine(withinThirtyDays, '여행은 최대 30일입니다.')
export const joinRoomInput = z.strictObject({
  inviteToken: z.string().regex(/^[A-Za-z0-9_-]{43}$/),
  displayName: z.string().trim().min(1).max(40),
})
export const createTimeBlockInput = z.strictObject({
  roomId: idSchema, dayId: idSchema, title, startTime: time, endTime: time,
  description: description.default(''), requestId,
}).refine(v => v.startTime < v.endTime, '종료 시간은 시작 시간 이후여야 합니다.')
export const updateTimeBlockInput = z.strictObject({
  roomId: idSchema, timeBlockId: idSchema, title, startTime: time, endTime: time,
  description, expectedVersion: z.number().int().positive(),
}).refine(v => v.startTime < v.endTime, '종료 시간은 시작 시간 이후여야 합니다.')
export const createPinInput = z.strictObject({
  roomId: idSchema, timeBlockId: idSchema, title,
  latitude: z.number().min(-90).max(90), longitude: z.number().min(-180).max(180),
  placeProvider: z.enum(['kakao', 'manual']),
  placeId: z.string().trim().min(1).max(200).optional(),
  description: description.default(''), category: z.string().trim().max(50).default(''),
  status: z.enum(['candidate', 'confirmed']).default('candidate'), requestId,
}).refine(v => v.placeProvider !== 'kakao' || Boolean(v.placeId), '카카오 장소 ID가 필요합니다.')
export const updatePinInput = z.strictObject({
  roomId: idSchema, pinId: idSchema, title, description,
  visitOrder: z.number().int().min(1).max(9999).optional(),
  category: z.string().trim().max(50), status: z.enum(['candidate', 'confirmed']),
  expectedVersion: z.number().int().positive(),
})
export const deletePinInput = z.strictObject({
  roomId: idSchema, pinId: idSchema, expectedVersion: z.number().int().positive(), requestId,
})
export const deleteTimeBlockInput = z.strictObject({
  roomId: idSchema, timeBlockId: idSchema, expectedVersion: z.number().int().positive(), requestId,
})
export const reorderPinsInput = z.strictObject({
  roomId: idSchema, timeBlockId: idSchema, orderedPinIds: z.array(idSchema).max(1000),
  expectedVersion: z.number().int().positive(), requestId,
})
export const sendMessageInput = z.strictObject({
  roomId: idSchema, content: z.string().trim().min(1).max(4000), requestId,
})
const routePoint = z.strictObject({
  latitude: z.number().min(-90).max(90), longitude: z.number().min(-180).max(180),
})
const routePath = z.array(routePoint).max(10000)
const routeDistance = z.number().int().nonnegative()
const routeDuration = z.number().int().nonnegative()
export const createRouteInput = z.strictObject({
  roomId: idSchema, timeBlockId: idSchema, name: title, mode: z.literal('car'),
  originPinId: idSchema, destinationPinId: idSchema, distanceMeters: routeDistance,
  durationSeconds: routeDuration, path: routePath, requestId,
}).refine(v => v.originPinId !== v.destinationPinId, {
  message: '출발 핀과 도착 핀은 서로 달라야 합니다.', path: ['destinationPinId'],
})
export const updateRouteInput = z.strictObject({
  roomId: idSchema, routeId: idSchema, name: title, distanceMeters: routeDistance,
  durationSeconds: routeDuration, path: routePath, expectedVersion: z.number().int().positive(), requestId,
})
export const deleteRouteInput = z.strictObject({
  roomId: idSchema, routeId: idSchema, expectedVersion: z.number().int().positive(), requestId,
})

export interface Versioned { version: number; createdAt: string; updatedAt: string }
export interface Room extends Versioned {
  id: string; name: string; destination: string; startDate: string; endDate: string;
  participantCount: number; createdBy: string
}
export interface RoomMember {
  roomId: string; userId: string; role: 'owner' | 'member'; displayName: string; joinedAt: string
}
export interface TravelDay { id: string; roomId: string; date: string; dayNumber: number }
export interface TimeBlock extends Versioned {
  id: string; roomId: string; dayId: string; title: string; startTime: string; endTime: string;
  description: string; createdBy: string; pinOrder?: string[]; deleting?: boolean
}
export interface Pin extends Versioned {
  id: string; roomId: string; timeBlockId: string; title: string; latitude: number; longitude: number;
  placeProvider: 'kakao' | 'manual'; placeId?: string; description: string; category: string;
  status: 'candidate' | 'confirmed'; createdBy: string; visitOrder?: number
}
export interface TravelRoute extends Versioned {
  id: string; roomId: string; timeBlockId: string; name: string; mode: 'car';
  originPinId: string; destinationPinId: string; distanceMeters: number; durationSeconds: number;
  path: Array<{ latitude: number; longitude: number }>; createdBy: string
}
export interface Message {
  id: string; roomId: string; userId: string; content: string; type: 'user' | 'ai' | 'system'; createdAt: string
  places?: PlaceRecommendation[]
}
export interface PlaceRecommendation {
  placeId: string; name: string; address: string; category: string; latitude: number; longitude: number;
  url: string; phone: string; reason: string
}
export interface RoomState {
  room: Room; members: RoomMember[]; days: TravelDay[]; timeBlocks: TimeBlock[];
  pins: Pin[]; routes: TravelRoute[]; messages: Message[]; messagesHasMore: boolean
}
export interface RoomEvent {
  roomId: string; eventId: string; entityType: 'room' | 'member' | 'timeBlock' | 'pin' | 'route' | 'message';
  entityId: string; action: 'created' | 'updated' | 'deleted'; occurredAt: string; data: unknown
}
export interface RoomInvite { roomId: string; inviteToken: string; expiresAt: string }
export type CreateRoomInput = z.input<typeof createRoomInput>
export type UpdateRoomInput = z.input<typeof updateRoomInput>
export type JoinRoomInput = z.input<typeof joinRoomInput>
export type CreateTimeBlockInput = z.input<typeof createTimeBlockInput>
export type UpdateTimeBlockInput = z.input<typeof updateTimeBlockInput>
export type DeleteTimeBlockInput = z.input<typeof deleteTimeBlockInput>
export type CreatePinInput = z.input<typeof createPinInput>
export type UpdatePinInput = z.input<typeof updatePinInput>
export type DeletePinInput = z.input<typeof deletePinInput>
export type ReorderPinsInput = z.input<typeof reorderPinsInput>
export type SendMessageInput = z.input<typeof sendMessageInput>
export type CreateRouteInput = z.input<typeof createRouteInput>
export type UpdateRouteInput = z.input<typeof updateRouteInput>
export type DeleteRouteInput = z.input<typeof deleteRouteInput>
