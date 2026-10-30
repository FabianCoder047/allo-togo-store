export type OutgoingNotification = {
  id: string
  channel: string
  recipient: string
  template: string
  payload: Record<string, unknown> | null
}

export interface NotificationProvider {
  readonly name: string
  send(notification: OutgoingNotification): Promise<{ providerMessageId: string }>
}

export class SimulatedWhatsAppProvider implements NotificationProvider {
  readonly name = 'simulated'

  async send(notification: OutgoingNotification) {
    // Ce mode est explicitement simulé : aucun message réel n'est envoyé.
    // eslint-disable-next-line no-console
    console.info(
      `[WHATSAPP SIMULÉ] → ${notification.recipient} | ${notification.template} | ${JSON.stringify(notification.payload)}`,
    )
    return { providerMessageId: `simulated-${notification.id}` }
  }
}

export class HttpWhatsAppProvider implements NotificationProvider {
  readonly name = 'http'

  constructor(
    private readonly apiUrl: string,
    private readonly token: string,
    private readonly sender?: string,
  ) {}

  async send(notification: OutgoingNotification) {
    const response = await fetch(this.apiUrl, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${this.token}`,
      },
      body: JSON.stringify({
        to: notification.recipient,
        from: this.sender,
        template: notification.template,
        data: notification.payload,
      }),
    })
    if (!response.ok) {
      throw new Error(`Le fournisseur WhatsApp a répondu ${response.status}`)
    }
    const body = (await response.json().catch(() => ({}))) as { id?: string; messageId?: string }
    return { providerMessageId: body.id ?? body.messageId ?? `http-${notification.id}` }
  }
}


export class SimulatedSmsProvider implements NotificationProvider {
  readonly name = 'simulated'

  async send(notification: OutgoingNotification) {
    // Ce mode est explicitement simulé : aucun SMS réel n'est envoyé.
    // eslint-disable-next-line no-console
    console.info(
      `[SMS SIMULÉ] → ${notification.recipient} | ${notification.template} | ${JSON.stringify(notification.payload)}`,
    )
    return { providerMessageId: `simulated-sms-${notification.id}` }
  }
}

export class HttpSmsProvider implements NotificationProvider {
  readonly name = 'http'

  constructor(
    private readonly apiUrl: string,
    private readonly token: string,
    private readonly sender?: string,
  ) {}

  async send(notification: OutgoingNotification) {
    const response = await fetch(this.apiUrl, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${this.token}`,
      },
      body: JSON.stringify({
        to: notification.recipient,
        from: this.sender,
        message: (notification.payload as { message?: string } | null)?.message ?? notification.template,
      }),
    })
    if (!response.ok) {
      throw new Error(`Le fournisseur SMS a répondu ${response.status}`)
    }
    const body = (await response.json().catch(() => ({}))) as { id?: string; messageId?: string }
    return { providerMessageId: body.id ?? body.messageId ?? `http-sms-${notification.id}` }
  }
}
