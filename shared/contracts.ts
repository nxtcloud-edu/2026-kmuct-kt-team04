import { z } from 'zod'

export const idSchema = z.uuid()
const title = z.string().trim().min(1).max(100)
const description = z.string().trim().max(2000)
const date = z.iso.date()
const time = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/)
const requestId = idSchema

export const createRoomInput = z.strictObject({
  name: title, destination: title, startDate: date, endDate: date,
  displayName: z.string().trim().min(1).max(40), requestId,
}).refine(v => v.endDate >= v.startDate, '종료일은 시작일 이후여야 합니다.')
  .refine(v => (Date.parse(v.endDate) - Date.parse(v.startDate)) / 86400000 < 30, '여행은 최대 30일입니다.')
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
  category: z.string().trim().max(50), status: z.enum(['candidate', 'confirmed']),
  expectedVersion: z.number().int().positive(),
})
export const sendMessageInput = z.strictObject({
  roomId: idSchema, content: z.string().trim().min(1).max(4000), requestId,
})

export interface Versioned { version: number; createdAt: string; updatedAt: string }
export interface Room extends Versioned {
  id: string; name: string; destination: string; startDate: string; endDate: string; createdBy: string
}
export interface RoomMember {
  roomId: string; userId: string; role: 'owner' | 'member'; displayName: string; joinedAt: string
}
export interface TravelDay { id: string; roomId: string; date: string; dayNumber: number }
export interface TimeBlock extends Versioned {
  id: string; roomId: string; dayId: string; title: string; startTime: string; endTime: string;
  description: string; createdBy: string
}
export interface Pin extends Versioned {
  id: string; roomId: string; timeBlockId: string; title: string; latitude: number; longitude: number;
  placeProvider: 'kakao' | 'manual'; placeId?: string; description: string; category: string;
  status: 'candidate' | 'confirmed'; createdBy: string
}
export interface Message {
  id: string; roomId: string; userId: string; content: string; type: 'user' | 'ai' | 'system'; createdAt: string
}
export interface RoomState {
  room: Room; members: RoomMember[]; days: TravelDay[]; timeBlocks: TimeBlock[];
  pins: Pin[]; messages: Message[]; messagesHasMore: boolean
}
export interface RoomEvent {
  roomId: string; eventId: string; entityType: 'room' | 'member' | 'timeBlock' | 'pin' | 'message';
  entityId: string; action: 'created' | 'updated'; occurredAt: string; data: unknown
}
export interface RoomInvite { roomId: string; inviteToken: string; expiresAt: string }
export type CreateRoomInput = z.input<typeof createRoomInput>
export type JoinRoomInput = z.input<typeof joinRoomInput>
export type CreateTimeBlockInput = z.input<typeof createTimeBlockInput>
export type UpdateTimeBlockInput = z.input<typeof updateTimeBlockInput>
export type CreatePinInput = z.input<typeof createPinInput>
export type UpdatePinInput = z.input<typeof updatePinInput>
export type SendMessageInput = z.input<typeof sendMessageInput>
