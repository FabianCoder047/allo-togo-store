import { afterEach, describe, expect, it, vi } from "vitest"
import {
  GmailApiEmailProvider,
  SmtpEmailProvider,
} from "../../src/modules/notifications/email.js"

afterEach(() => {
  vi.unstubAllGlobals()
})

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

describe("Provider email Gmail API", () => {
  it("rafraîchit le jeton OAuth et envoie un email MIME via l’API Gmail", async () => {
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ access_token: "temporary-access-token" }), {
          status: 200,
          headers: { "content-type": "application/json" },
        }),
      )
      .mockImplementationOnce(async (_url, init) => {
        const request = JSON.parse(String(init?.body)) as { raw: string }
        const decoded = Buffer.from(request.raw, "base64url").toString("utf8")
        expect(decoded).toContain(
          `From: =?UTF-8?B?${Buffer.from("Allo-Togo Shop").toString("base64")}?= <sender@gmail.com>`,
        )
        expect(decoded).toContain("To: staff@example.test")
        expect(decoded).toContain(
          `Subject: =?UTF-8?B?${Buffer.from("Vos accès").toString("base64")}?=`,
        )
        expect(decoded).toContain(
          Buffer.from("Votre mot de passe provisoire.", "utf8").toString("base64"),
        )
        expect(decoded).toContain(
          Buffer.from("<p>Votre mot de passe provisoire.</p>", "utf8").toString(
            "base64",
          ),
        )
        return new Response(JSON.stringify({ id: "gmail-message-123" }), {
          status: 200,
          headers: { "content-type": "application/json" },
        })
      })
    vi.stubGlobal("fetch", fetch)
    const provider = new GmailApiEmailProvider(
      "oauth-client-id",
      "oauth-client-secret",
      "oauth-refresh-token",
      "sender@gmail.com",
      "Allo-Togo Shop",
    )

    const result = await provider.send({
      to: "staff@example.test",
      subject: "Vos accès",
      text: "Votre mot de passe provisoire.",
      html: "<p>Votre mot de passe provisoire.</p>",
    })

    expect(fetch).toHaveBeenNthCalledWith(
      1,
      "https://oauth2.googleapis.com/token",
      expect.objectContaining({
        method: "POST",
        body: new URLSearchParams({
          client_id: "oauth-client-id",
          client_secret: "oauth-client-secret",
          refresh_token: "oauth-refresh-token",
          grant_type: "refresh_token",
        }).toString(),
      }),
    )
    expect(fetch).toHaveBeenNthCalledWith(
      2,
      "https://gmail.googleapis.com/gmail/v1/users/me/messages/send",
      expect.objectContaining({
        method: "POST",
        headers: {
          authorization: "Bearer temporary-access-token",
          "content-type": "application/json",
        },
      }),
    )
    expect(result).toEqual({ providerMessageId: "gmail-message-123" })
  })

  it("signale un échec de rafraîchissement OAuth", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response('{"error":"invalid_grant"}', { status: 400 })),
    )
    const provider = new GmailApiEmailProvider(
      "oauth-client-id",
      "oauth-client-secret",
      "expired-refresh-token",
      "sender@gmail.com",
      "Allo-Togo Shop",
    )

    await expect(
      provider.send({
        to: "staff@example.test",
        subject: "Vos accès",
        text: "Votre mot de passe provisoire.",
      }),
    ).rejects.toThrow("Google OAuth a répondu 400")
  })
})
