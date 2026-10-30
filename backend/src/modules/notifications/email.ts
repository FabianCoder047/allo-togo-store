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
  if (env.isProduction) {
    throw new Error(
      "Un fournisseur email réel est requis en production : EMAIL_PROVIDER=smtp avec MAIL_* ou EMAIL_PROVIDER=http avec EMAIL_API_URL/EMAIL_API_TOKEN.",
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
    <p>Ce mot de passe est temporaire. Vous devrez le changer dès votre première connexion.</p>
    <p>Si vous n’êtes pas à l’origine de cette demande, contactez la direction Allo Togo.</p>
  `.trim()

  return sendEmail({ to: input.email, subject, text, html })
}
