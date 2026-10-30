import { describe, expect, it, vi } from "vitest"
import { SmtpEmailProvider } from "../../src/modules/notifications/email.js"

describe("Provider email SMTP", () => {
  it("transmet le message avec l’expéditeur nommé et retourne l’identifiant SMTP", async () => {
    const sendMail = vi.fn(async () => ({
      messageId: "<message-123@example.test>",
    }))
    const provider = new SmtpEmailProvider(
      "paulingoudo@example.test",
      "Allo-Togo Shop",
      { sendMail } as never,
    )

    const result = await provider.send({
      to: "client@example.test",
      subject: "Confirmation",
      text: "Votre commande est enregistrée.",
      html: "<p>Votre commande est enregistrée.</p>",
    })

    expect(sendMail).toHaveBeenCalledWith({
      from: { name: "Allo-Togo Shop", address: "paulingoudo@example.test" },
      to: "client@example.test",
      subject: "Confirmation",
      text: "Votre commande est enregistrée.",
      html: "<p>Votre commande est enregistrée.</p>",
    })
    expect(result).toEqual({ providerMessageId: "<message-123@example.test>" })
  })
})
