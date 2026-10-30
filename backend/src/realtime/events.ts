import { EventEmitter } from 'node:events'

export type RealtimeMessage = {
  orderId: string
  conversationId: string
  visibility: 'CLIENT' | 'INTERNAL'
  message: {
    id: string
    authorType: string
    authorName: string
    body: string
    createdAt: string
  }
}

export const realtime = new EventEmitter()
