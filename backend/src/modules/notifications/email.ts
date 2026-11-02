import { randomUUID } from "node:crypto"
import type { StaffRole } from "@prisma/client"
import nodemailer, { type Transporter } from "nodemailer"
import { env } from "../../config/env.js"

export type EmailMessage = {
  to: string
  subject: string
  text: string
  html?: string
}

export interface EmailProvider {
  readonly name: string
  send(message: EmailMessage): Promise<{ providerMessageId: string }>
}

const encodeMimeHeader = (value: string) =>
  `=?UTF-8?B?${Buffer.from(value, "utf8").toString("base64")}?=`

const encodeMimeBody = (value: string) =>
  Buffer.from(value, "utf8")
    .toString("base64")
    .match(/.{1,76}/g)
    ?.join("\r\n") ?? ""

export class GmailApiEmailProvider implements EmailProvider {
  readonly name = "google"

  constructor(
    private readonly clientId: string,
    private readonly clientSecret: string,
    private readonly refreshToken: string,
    private readonly senderEmail: string,
    private readonly senderName: string,
  ) {}

  private async getAccessToken() {
    const response = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      signal: AbortSignal.timeout(15_000),
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: this.clientId,
        client_secret: this.clientSecret,
        refresh_token: this.refreshToken,
        grant_type: "refresh_token",
      }),
    })
    if (!response.ok) {
      const details = await response.text()
      throw new Error(
        `Google OAuth a répondu ${response.status}${details ? ` : ${details.slice(0, 500)}` : ""}`,
      )
    }

    const body = (await response.json()) as { access_token?: string }
    if (!body.access_token) {
      throw new Error("Google OAuth n’a pas retourné de jeton d’accès.")
    }
    return body.access_token
  }

  async send(message: EmailMessage) {
    if (
      !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(this.senderEmail) ||
      !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(message.to)
    ) {
      throw new Error("L’adresse expéditrice ou destinataire est invalide.")
    }
    if (/[\r\n]/.test(message.subject) || /[\r\n]/.test(this.senderName)) {
      throw new Error("Le nom de l’expéditeur ou l’objet contient un saut de ligne.")
    }

    const boundary = `allo-togo-${randomUUID()}`
    const parts = [
      `From: ${encodeMimeHeader(this.senderName)} <${this.senderEmail}>`,
      `To: ${message.to}`,
      `Subject: ${encodeMimeHeader(message.subject)}`,
      "MIME-Version: 1.0",
      `Content-Type: multipart/alternative; boundary="${boundary}"`,
      "",
      `--${boundary}`,
      "Content-Type: text/plain; charset=UTF-8",
      "Content-Transfer-Encoding: base64",
      "",
      encodeMimeBody(message.text),
    ]
    if (message.html) {
      parts.push(
        `--${boundary}`,
        "Content-Type: text/html; charset=UTF-8",
        "Content-Transfer-Encoding: base64",
        "",
        encodeMimeBody(message.html),
      )
    }
    parts.push(`--${boundary}--`, "")

    const response = await fetch(
      "https://gmail.googleapis.com/gmail/v1/users/me/messages/send",
      {
        method: "POST",
        signal: AbortSignal.timeout(15_000),
        headers: {
          authorization: `Bearer ${await this.getAccessToken()}`,
          "content-type": "application/json",
        },
        body: JSON.stringify({
          raw: Buffer.from(parts.join("\r\n"), "utf8").toString("base64url"),
        }),
      },
    )
    if (!response.ok) {
      const details = await response.text()
      throw new Error(
        `Gmail API a répondu ${response.status}${details ? ` : ${details.slice(0, 500)}` : ""}`,
      )
    }
    const body = (await response.json().catch(() => ({}))) as { id?: string }
    return {
      providerMessageId: body.id ?? `gmail-api-${Date.now()}`,
    }
  }
}

export class HttpEmailProvider implements EmailProvider {
  readonly name = "http"

  constructor(
    private readonly apiUrl: string,
    private readonly token: string,
    private readonly from: string,
  ) {}

  async send(message: EmailMessage) {
    const response = await fetch(this.apiUrl, {
      method: "POST",
      signal: AbortSignal.timeout(15_000),
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${this.token}`,
      },
      body: JSON.stringify({
        from: this.from,
        to: message.to,
        subject: message.subject,
        text: message.text,
        ...(message.html ? { html: message.html } : {}),
      }),
    })
    if (!response.ok) {
      throw new Error(`Le fournisseur email a répondu ${response.status}`)
    }
    const body = (await response.json().catch(() => ({}))) as {
      id?: string
      messageId?: string
    }
    return {
      providerMessageId:
        body.id ?? body.messageId ?? `http-email-${Date.now()}`,
    }
  }
}

export class SmtpEmailProvider implements EmailProvider {
  readonly name = "smtp"
  private readonly transporter: Pick<Transporter, "sendMail">

  constructor(
    private readonly from: string,
    private readonly fromName: string,
    transport?: Pick<Transporter, "sendMail">,
  ) {
    this.transporter =
      transport ??
      nodemailer.createTransport({
        host: env.MAIL_HOST,
        port: env.MAIL_PORT,
        secure: env.MAIL_PORT === 465,
        auth: { user: env.MAIL_USERNAME, pass: env.MAIL_PASSWORD },
        connectionTimeout: 10_000,
        greetingTimeout: 10_000,
        socketTimeout: 15_000,
      })
  }

  async send(message: EmailMessage) {
    const result = await this.transporter.sendMail({
      from: { name: this.fromName, address: this.from },
      to: message.to,
      subject: message.subject,
      text: message.text,
      ...(message.html ? { html: message.html } : {}),
    })
    return { providerMessageId: result.messageId ?? `smtp-email-${Date.now()}` }
  }
}

export const emailMode = () => ({
  provider: env.EMAIL_PROVIDER,
  configured:
    env.EMAIL_PROVIDER === "smtp"
      ? Boolean(
          env.MAIL_USERNAME &&
            env.MAIL_PASSWORD &&
            (env.MAIL_FROM || env.MAIL_USERNAME),
        )
      : env.EMAIL_PROVIDER === "google"
        ? Boolean(
            env.GMAIL_CLIENT_ID &&
              env.GMAIL_CLIENT_SECRET &&
              env.GMAIL_REFRESH_TOKEN &&
              env.MAIL_USERNAME,
          )
        : Boolean(env.EMAIL_API_URL && env.EMAIL_API_TOKEN),
})

const buildEmailProvider = (): EmailProvider => {
  if (env.EMAIL_PROVIDER === "smtp") {
    if (!env.MAIL_USERNAME || !env.MAIL_PASSWORD) {
      throw new Error(
        "MAIL_USERNAME et MAIL_PASSWORD sont requis lorsque EMAIL_PROVIDER=smtp.",
      )
    }
    return new SmtpEmailProvider(
      env.MAIL_FROM ?? env.MAIL_USERNAME,
      env.MAIL_FROM_NAME,
    )
  }
  if (env.EMAIL_PROVIDER === "http") {
    if (!env.EMAIL_API_URL || !env.EMAIL_API_TOKEN) {
      throw new Error(
        "EMAIL_API_URL et EMAIL_API_TOKEN sont requis lorsque EMAIL_PROVIDER=http.",
      )
    }
    return new HttpEmailProvider(
      env.EMAIL_API_URL,
      env.EMAIL_API_TOKEN,
      env.EMAIL_FROM,
    )
  }
  if (env.EMAIL_PROVIDER === "google") {
    if (
      !env.GMAIL_CLIENT_ID ||
      !env.GMAIL_CLIENT_SECRET ||
      !env.GMAIL_REFRESH_TOKEN ||
      !env.MAIL_USERNAME
    ) {
      throw new Error(
        "GMAIL_CLIENT_ID, GMAIL_CLIENT_SECRET, GMAIL_REFRESH_TOKEN et MAIL_USERNAME sont requis lorsque EMAIL_PROVIDER=google.",
      )
    }
    return new GmailApiEmailProvider(
      env.GMAIL_CLIENT_ID,
      env.GMAIL_CLIENT_SECRET,
      env.GMAIL_REFRESH_TOKEN,
      env.MAIL_USERNAME,
      env.MAIL_FROM_NAME,
    )
  }
  if (env.isProduction) {
    throw new Error(
      "Un fournisseur email réel est requis en production : SMTP, HTTP avec EMAIL_API_URL/EMAIL_API_TOKEN ou Gmail API OAuth avec GMAIL_*.",
    )
  }
  // Development default: smtp with configured defaults
  if (!env.MAIL_USERNAME) {
    throw new Error("MAIL_USERNAME est requis en mode développement.")
  }
  return new SmtpEmailProvider(
    env.MAIL_FROM ?? env.MAIL_USERNAME,
    env.MAIL_FROM_NAME,
  )
}

export const sendEmail = async (message: EmailMessage) => {
  const provider = buildEmailProvider()
  return provider.send(message)
}

const ROLE_LABELS: Record<StaffRole, string> = {
  DIRECTOR: "directeur",
  ADMIN: "informaticien",
  COMMERCIAL: "agent commercial",
  TECHNICIAN: "technicien",
  DELIVERY: "livreur",
}

const escapeHtml = (value: string) =>
  value.replace(
    /[&<>"']/g,
    (character) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        character
      ] ?? character,
  )

export const sendStaffCredentialsEmail = async (input: {
  name: string
  email: string
  role: StaffRole
  temporaryPassword: string
}) => {
  const loginPath =
    input.role === "TECHNICIAN" || input.role === "DELIVERY"
      ? "/staff"
      : "/admin"
  const loginUrl = `${env.PUBLIC_APP_URL.replace(/\/$/, "")}${loginPath}`
  const roleLabel = ROLE_LABELS[input.role]
  const subject = "Votre accès Allo Togo Store"
  const text = [
    `Bonjour ${input.name},`,
    `Un compte ${roleLabel} vient d’être créé pour vous sur Allo Togo Store.`,
    `Adresse de connexion : ${loginUrl}`,
    `Email : ${input.email}`,
    `Mot de passe provisoire : ${input.temporaryPassword}`,
    "Ce mot de passe provisoire expire dans 15 minutes. Connectez-vous et changez-le avant son expiration.",
    "Ce mot de passe est temporaire. Vous devrez le changer dès votre première connexion.",
    "Si vous n’êtes pas à l’origine de cette demande, contactez la direction Allo Togo.",
  ].join("\n\n")

  const html = `
    <p>Bonjour ${escapeHtml(input.name)},</p>
    <p>Un compte <strong>${escapeHtml(roleLabel)}</strong> vient d’être créé pour vous sur Allo Togo Store.</p>
    <p><a href="${escapeHtml(loginUrl)}">Se connecter à mon espace</a></p>
    <ul>
      <li><strong>Email :</strong> ${escapeHtml(input.email)}</li>
      <li><strong>Mot de passe provisoire :</strong> <code>${escapeHtml(input.temporaryPassword)}</code></li>
    </ul>
    <p>Ce mot de passe provisoire expire dans 15 minutes. Connectez-vous et changez-le avant son expiration.</p>
    <p>Ce mot de passe est temporaire. Vous devrez le changer dès votre première connexion.</p>
    <p>Si vous n’êtes pas à l’origine de cette demande, contactez la direction Allo Togo.</p>
  `.trim()

  return sendEmail({ to: input.email, subject, text, html })
}
