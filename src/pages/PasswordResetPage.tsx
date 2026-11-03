import { useState } from "react"
import { Icon } from "../components/Icon"
import { api, errorMessage } from "../lib/api"
import { BRAND_LOGO } from "../lib/brand"

export function PasswordResetPage({
  navigate,
}: {
  navigate: (path: string) => void
}) {
  const search = new URLSearchParams(window.location.search)
  const token = search.get("token") ?? ""
  const loginPath = search.get("area") === "staff" ? "/staff" : "/admin"
  const [error, setError] = useState<string | null>(null)
  const [requested, setRequested] = useState(false)
  const [reset, setReset] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [password, setPassword] = useState<string>("")
  const [confirmation, setConfirmation] = useState<string>("")
  const [email, setEmail] = useState<string>("")

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setSubmitting(true)
    setError(null)
    try {
      if (!token) {
        await api.auth.requestPasswordReset(email)
        setRequested(true)
        return
      }
      if (password !== confirmation) {
        setError("Les deux nouveaux mots de passe ne correspondent pas.")
        return
      }
      await api.auth.resetPassword(token, password)
      setReset(true)
    } catch (err) {
      setError(errorMessage(err))
    } finally {
      setSubmitting(false)
    }
  }

  const title = token
    ? "Choisissez un nouveau mot de passe"
    : "Réinitialiser votre mot de passe"

  return (
    <main className="login-page">
      <div className="login-card">
        <div className="login-brand">
          <div className="brand">
            <img src={BRAND_LOGO} alt="Allo Togo" />
            <span>
              <strong>ALLO TOGO</strong>
              <small>MOT DE PASSE OUBLIÉ</small>
            </span>
          </div>
          <span className="eyebrow">{title}</span>
          <h1>{title}</h1>
          <p>
            {token
              ? "Définissez un nouveau mot de passe pour votre compte."
              : "Saisissez l’adresse email de votre compte. Si elle est associée à un compte actif, vous recevrez un lien de réinitialisation."}
          </p>
        </div>
        {!requested && !reset ? (
          <form className="login-form" onSubmit={handleSubmit}>
            {error && <div className="alert error">{error}</div>}
            {!token ? (
              <label>
                Email professionnel
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  autoComplete="username"
                  placeholder="nom@allotogo.test"
                />
              </label>
            ) : (
              <>
                <label>
                  Nouveau mot de passe
                  <input
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                    minLength={8}
                    autoComplete="new-password"
                    placeholder="8 caractères minimum"
                  />
                  <span className="password-requirements">
                    Au moins 8 caractères, une majuscule, une minuscule et un
                    chiffre
                  </span>
                </label>
                <label>
                  Confirmer le mot de passe
                  <input
                    type="password"
                    value={confirmation}
                    onChange={(e) => setConfirmation(e.target.value)}
                    required
                    minLength={8}
                    autoComplete="new-password"
                    placeholder="Répétez le mot de passe"
                  />
                </label>
              </>
            )}
            <button
              type="submit"
              disabled={submitting}
              className="primary wide"
            >
              {submitting
                ? "Envoi…"
                : token
                  ? "Enregistrer le nouveau mot de passe"
                  : "Recevoir un lien de réinitialisation"}
            </button>
            <button
              type="button"
              className="back-link"
              onClick={() => navigate(loginPath)}
            >
              <Icon name="arrow" /> Retour à la connexion
            </button>
          </form>
        ) : (
          <div className="login-form">
            <div className="alert success">
              {requested
                ? "Si cette adresse correspond à un compte actif, un lien de réinitialisation vient d’être envoyé."
                : "Mot de passe réinitialisé. Vous pouvez maintenant vous connecter."}
            </div>
            <button
              type="button"
              className="primary wide"
              onClick={() => navigate("/admin")}
            >
              Connexion administration
            </button>
            <button
              type="button"
              className="secondary wide"
              onClick={() => navigate("/staff")}
            >
              Connexion intervenant
            </button>
            <button
              type="button"
              className="back-link"
              onClick={() => navigate("/")}
            >
              <Icon name="arrow" /> Retour à la boutique
            </button>
          </div>
        )}
      </div>
    </main>
  )
}
