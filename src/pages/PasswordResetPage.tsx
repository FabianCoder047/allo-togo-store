import { useState } from 'react'
import { Icon } from '../components/Icon'
import { useNavigate } from 'react-router-dom'
import { useStore } from '../context/StoreContext'
import { api, errorMessage } from '../lib/api'
import { roleLabels } from '../lib/labels'

export function PasswordResetPage() {
  const navigate = useNavigate()
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<boolean | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [password, setPassword] = useState<string>('')
  const [confirmation, setConfirmation] = useState<string>('')
  const [email, setEmail] = useState<string>('')

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setSubmitting(true)
    setError(null)

    if (password !== confirmation) {
      setError('Les deux nouveaux mots de passe ne correspondent pas.')
      setSubmitting(false)
      return
    }

    try {
      await api.auth.changePassword(email, password)
      setSuccess(true)
      setSubmitting(false)
      navigate('/')
    } catch (err) {
      setError(errorMessage(err))
      setSubmitting(false)
    }
  }

  return (
    <main className="login-page">
      <div className="login-card">
        <div className="login-brand">
          <div className="brand">
            <img src="https://www.allotogoconciergerietech-ia.com/wp-content/uploads/2026/02/cropped-WhatsApp-Image-2026-01-27-at-09.30.20-300x216-removebg-preview.png" alt="Allo Togo" />
            <span>
              <strong>ALLO TOGO</strong>
              <small>MOT DE PASSE OUBLIÉ</small>
            </span>
          </div>
          <span className="eyebrow">Réinitialiser votre mot de passe</span>
          <h1>Choisissez un nouveau mot de passe</h1>
          <p>
            Entrez un nouveau mot de passe pour retrouver l'accès à votre compte.
          </p>
          {error && <div className="alert error">{error}</div>}
          {success && <div className="alert success">Mot de passe réinitialisé avec succès. Vous pouvez maintenant vous connecter.</div>}
          <form className="login-form" onSubmit={handleSubmit}>
            <label>
              Email
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                autoComplete="username"
                placeholder="nom@allotogo.test"
              />
            </label>
            <label>
              Nouveau mot de passe
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                minLength={8}
                placeholder="8 caractères minimum"
              />
              <span className="password-requirements">
                Au moins 8 caractères, une majuscule, une minuscule et un chiffre
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
                placeholder="Répétez le mot de passe"
              />
            </label>
            <button type="submit" disabled={submitting} className="primary wide">
              {submitting ? 'Enregistrement…' : 'Réinitialiser le mot de passe'}
            </button>
            <button type="button" className="back-link" onClick={() => navigate('/')}>n              <Icon name="arrow" /> Retour à la boutique
            </button>
          </form>
        </div>
      </main>
    </main>
  )
}
