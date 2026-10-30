import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { prisma } from '../../src/db/prisma.js'
import { TEST_STAFF } from '../helpers/testEnv.js'
import {
  assertStatus,
  checkout,
  client,
  login,
  productBySku,
  type Session,
} from '../helpers/api.js'

let employee: Session
let gpsProductId: string

const ask = (message: string, sessionId: string, history?: Array<{ role: 'client' | 'ai'; text: string }>) =>
  client().post('/api/assistant').send({ message, sessionId, history })

const escalationCount = () =>
  prisma.notification.count({
    where: { recipient: employee.user.id, template: 'ASSISTANT_ESCALATION' },
  })

beforeAll(async () => {
  employee = await login(TEST_STAFF.commercial.email, TEST_STAFF.commercial.password)
  gpsProductId = (await productBySku('GPS-COMPACT-01')).id
})

afterAll(async () => {
  await prisma.$disconnect()
})

describe('Assistant Allo Togo', () => {
  it('répond avec un produit du catalogue actif', async () => {
    const response = await ask('Quel traceur GPS conseillez-vous pour une moto ?', 'assistant-catalogue')
    assertStatus(response, 200, 'question catalogue')
    expect(response.body.data.action).toBe('ANSWER')
    expect(response.body.data.reply).toContain('Solution GPS Moto')
    expect(response.body.data.suggestions[0].path).toMatch(/^\/produit\//)
  })

  it('résout une relance courte avec l’historique', async () => {
    const response = await ask('Et pour une moto ?', 'assistant-relance', [
      { role: 'client', text: 'Quels traceurs GPS proposez-vous ?' },
      { role: 'ai', text: 'Voici les traceurs GPS disponibles.' },
    ])
    assertStatus(response, 200, 'relance courte')
    expect(response.body.data.action).toBe('ANSWER')
    expect(response.body.data.reply).toContain('Solution GPS Moto')
  })

  it('refuse une question hors périmètre sans escalader', async () => {
    const before = await escalationCount()
    const response = await ask('Quelle est la météo à Lomé aujourd’hui ?', 'assistant-hors-sujet')
    assertStatus(response, 200, 'question hors périmètre')
    expect(response.body.data.action).toBe('OUT_OF_SCOPE')
    expect(response.body.data.escalated).toBe(false)
    expect(await escalationCount()).toBe(before)
  })

  it('n’utilise pas l’historique pour transformer une question hors sujet en réponse produit', async () => {
    const response = await ask('Qui est le président du Togo ?', 'assistant-historique-hors-sujet', [
      { role: 'client', text: 'Quel traceur GPS conseillez-vous pour une moto ?' },
      { role: 'ai', text: 'Solution GPS Moto — 29 000 FCFA.' },
    ])
    assertStatus(response, 200, 'historique hors sujet')
    expect(response.body.data.action).toBe('OUT_OF_SCOPE')
    expect(response.body.data.reply).not.toContain('Solution GPS Moto')
  })

  it('n’assimile pas une question de politique interne à un pack de services générique', async () => {
    const response = await ask(
      'Quelle est la politique interne de traitement des litiges fournisseurs pour les packs entreprises ?',
      'assistant-politique-interne',
    )
    assertStatus(response, 200, 'politique interne')
    expect(response.body.data.action).toBe('ESCALATE')
    expect(response.body.data.reply).not.toContain('Consulting')
  })

  it('escalade une question Allo Togo non couverte et notifie les employés', async () => {
    const message = 'Quelle est la politique de gestion des litiges fournisseurs pour les packs entreprises ?'
    const response = await ask(message, 'assistant-escalade', [
      { role: 'client', text: 'Quel traceur GPS conseillez-vous pour une moto ?' },
      { role: 'ai', text: 'Solution GPS Moto — 29 000 FCFA.' },
    ])
    assertStatus(response, 200, 'escalade')
    expect(response.body.data.action).toBe('ESCALATE')
    expect(response.body.data.escalated).toBe(true)
    expect(response.body.data.reference).toMatch(/^ESC-[A-Z0-9]{6}$/)

    const reference = response.body.data.reference as string
    const notifications = await prisma.notification.findMany({
      where: { recipient: employee.user.id, template: 'ASSISTANT_ESCALATION' },
      orderBy: { createdAt: 'desc' },
      take: 10,
    })
    expect(
      notifications.some((notification) => {
        const payload = notification.payload as { reference?: string; customerMessage?: string } | null
        return payload?.reference === reference && payload.customerMessage === message
      }),
    ).toBe(true)

    const alerts = await client()
      .get('/api/staff/assistant-alerts')
      .set('Authorization', `Bearer ${employee.token}`)
    assertStatus(alerts, 200, 'alertes employé')
    expect(
      alerts.body.data.some((alert: { payload?: { reference?: string } }) => alert.payload?.reference === reference),
    ).toBe(true)
  })

  it('ouvre la discussion d’une alerte et permet à un employé de répondre', async () => {
    const sessionId = 'assistant-thread-reponse-employe'
    const message = 'Quelle procédure interne appliquer pour un litige fournisseur sur un pack entreprise ?'
    const response = await ask(message, sessionId)
    assertStatus(response, 200, 'escalade pour discussion')
    const reference = response.body.data.reference as string

    const notifications = await client()
      .get('/api/staff/notifications')
      .set('Authorization', `Bearer ${employee.token}`)
    assertStatus(notifications, 200, 'notifications employé')
    const alert = notifications.body.data.find(
      (item: { template?: string; payload?: { reference?: string } }) =>
        item.template === 'ASSISTANT_ESCALATION' && item.payload?.reference === reference,
    ) as { assistantThreadId?: string } | undefined
    expect(alert?.assistantThreadId).toBeTruthy()

    const thread = await client()
      .get(`/api/staff/assistant-threads/${alert!.assistantThreadId}`)
      .set('Authorization', `Bearer ${employee.token}`)
    assertStatus(thread, 200, 'discussion employé')
    expect(
      thread.body.data.messages.some(
        (item: { authorType?: string; body?: string }) => item.authorType === 'CLIENT' && item.body === message,
      ),
    ).toBe(true)

    const replyBody = 'Merci, un responsable vous répond avec la procédure officielle sous 24 h.'
    const reply = await client()
      .post(`/api/staff/assistant-threads/${alert!.assistantThreadId}/messages`)
      .set('Authorization', `Bearer ${employee.token}`)
      .send({ body: replyBody })
    assertStatus(reply, 201, 'réponse employé')
    expect(reply.body.data.authorType).toBe('STAFF')

    const publicThread = await client().get(`/api/assistant/thread/${sessionId}`)
    assertStatus(publicThread, 200, 'discussion publique')
    expect(
      publicThread.body.data.messages.some(
        (item: { authorType?: string; body?: string }) => item.authorType === 'STAFF' && item.body === replyBody,
      ),
    ).toBe(true)

    const resolved = await client()
      .patch(`/api/staff/assistant-threads/${alert!.assistantThreadId}`)
      .set('Authorization', `Bearer ${employee.token}`)
      .send({ status: 'RESOLVED' })
    assertStatus(resolved, 200, 'clôture discussion')
    expect(resolved.body.data.status).toBe('RESOLVED')
  })

  it('retrouve une commande par code de suivi ou par numéro de commande', async () => {
    const created = await checkout([{ productId: gpsProductId, quantity: 1 }])
    const order = created.orders[0]

    const byTracking = await ask(`Où en est la commande ${order.trackingCode} ?`, 'assistant-suivi-code')
    assertStatus(byTracking, 200, 'suivi par code')
    expect(byTracking.body.data.action).toBe('ANSWER')
    expect(byTracking.body.data.reply).toContain(order.orderNumber)
    expect(byTracking.body.data.suggestions[0].path).toBe(`/suivi/${order.trackingCode}`)

    const byNumber = await ask(`Où en est la commande ${order.orderNumber} ?`, 'assistant-suivi-numero')
    assertStatus(byNumber, 200, 'suivi par numéro')
    expect(byNumber.body.data.action).toBe('ANSWER')
    expect(byNumber.body.data.reply).toContain(order.orderNumber)
  })
})
