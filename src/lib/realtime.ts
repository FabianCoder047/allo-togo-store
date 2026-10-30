import { io, type Socket } from 'socket.io-client'
import { getAccessToken } from './api'

let socket: Socket | null = null
let socketToken: string | null = null

/**
 * Connexion Socket.IO du personnel (administrateur, employé, technicien, livreur).
 * Le jeton d'accès est passé dans le handshake ; le serveur vérifie les droits
 * avant d'autoriser l'entrée dans le salon d'une commande.
 */
export const getStaffSocket = (): Socket | null => {
  const token = getAccessToken()
  if (!token) return null

  if (socket && socketToken === token) {
    if (!socket.connected) socket.connect()
    return socket
  }

  socket?.disconnect()
  socketToken = token
  socket = io({
    path: '/socket.io',
    auth: { token },
    transports: ['websocket', 'polling'],
    reconnectionDelayMax: 10_000,
  })
  return socket
}

export const disconnectStaffSocket = () => {
  socket?.disconnect()
  socket = null
  socketToken = null
}
