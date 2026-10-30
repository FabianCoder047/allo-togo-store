import type { StaffRole } from '@prisma/client'

declare global {
  namespace Express {
    interface Request {
      user?: {
        id: string
        name: string
        email: string
        role: StaffRole
        mustChangePassword: boolean
      }
      tracking?: {
        orderId: string
        trackingCode: string
      }
      rawBody?: Buffer
    }
  }
}

export {}
