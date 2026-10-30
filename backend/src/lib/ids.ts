import { createHash, randomBytes, timingSafeEqual } from 'node:crypto'

const TRACKING_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
const PASSWORD_UPPER = 'ABCDEFGHJKLMNPQRSTUVWXYZ'
const PASSWORD_LOWER = 'abcdefghijkmnopqrstuvwxyz'
const PASSWORD_DIGITS = '23456789'
const PASSWORD_ALPHABET = `${PASSWORD_UPPER}${PASSWORD_LOWER}${PASSWORD_DIGITS}`

export const randomToken = (bytes = 32) => randomBytes(bytes).toString('base64url')

export const sha256 = (value: string) => createHash('sha256').update(value).digest('hex')

export const safeEqual = (a: string, b: string) => {
  const bufferA = Buffer.from(a)
  const bufferB = Buffer.from(b)
  return bufferA.length === bufferB.length && timingSafeEqual(bufferA, bufferB)
}

export const generateTrackingCode = (length = 12) => {
  const bytes = randomBytes(length)
  let code = ''
  for (let index = 0; index < length; index += 1) {
    code += TRACKING_ALPHABET[bytes[index] % TRACKING_ALPHABET.length]
  }
  return code
}

const randomCharacter = (alphabet: string) => {
  const bytes = randomBytes(1)
  return alphabet[bytes[0] % alphabet.length]
}

export const generateTemporaryPassword = (length = 6) => {
  const required = [
    randomCharacter(PASSWORD_UPPER),
    randomCharacter(PASSWORD_LOWER),
    randomCharacter(PASSWORD_DIGITS),
  ]
  const remaining = Array.from({ length: Math.max(0, length - required.length) }, () =>
    randomCharacter(PASSWORD_ALPHABET),
  )
  const characters = [...required, ...remaining].slice(0, Math.max(length, required.length))
  for (let index = characters.length - 1; index > 0; index -= 1) {
    const swapIndex = randomBytes(1)[0] % (index + 1)
    ;[characters[index], characters[swapIndex]] = [characters[swapIndex], characters[index]]
  }
  return characters.join('')
}

export const generatePublicRef = () => {
  const date = new Date()
  const stamp = `${date.getUTCFullYear()}${String(date.getUTCMonth() + 1).padStart(2, '0')}${String(
    date.getUTCDate(),
  ).padStart(2, '0')}`
  return `ATG-${stamp}-${generateTrackingCode(6)}`
}

export const generateOrderNumber = (type: 'GPS' | 'DRINK') => {
  const date = new Date()
  const stamp = `${date.getUTCFullYear()}${String(date.getUTCMonth() + 1).padStart(2, '0')}${String(
    date.getUTCDate(),
  ).padStart(2, '0')}`
  return `CMD-${type}-${stamp}-${generateTrackingCode(5)}`
}

export const generateQuoteReference = () => {
  const date = new Date()
  const stamp = `${date.getUTCFullYear()}${String(date.getUTCMonth() + 1).padStart(2, '0')}${String(
    date.getUTCDate(),
  ).padStart(2, '0')}`
  return `DEV-${stamp}-${generateTrackingCode(5)}`
}

export const normalizePhone = (phone: string) => phone.replace(/[^\d+]/g, '').replace(/^\+?228/, '')

export const hashPhone = (phone: string) => sha256(`allo-togo:phone:${normalizePhone(phone)}`)
