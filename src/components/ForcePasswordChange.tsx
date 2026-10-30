import { useState } from 'react'
import { Icon } from './Icon'
import { Alert } from './ui'
import { useStore } from '../context/StoreContext'
import { api, errorMessage } from '../lib/api'
import { BRAND_LOGO } from '../lib/brand'
import { roleLabels } from '../lib/labels'
import { homeForRole } from '../pages/LoginPage'
import type { StaffUser } from '../types'

export function ForcePasswordChange({
  user,
  navigate,
}: {
  user: StaffUser
  navigate: (path: string) => void
}) {
  const { logout, notify } = useStore()
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  const submit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const form = new FormData(event.currentTarget)
    const currentPassword = String(form.get('currentPassword') ?? '')
    const newPassword = String(form.get('newPassword') ?? '')
    const confirmation = String(form.get('confirmation') ?? '')

    if (newPassword !== confirmation) {
      setError('Les deux nouveaux mots de passe ne correspondent pas.')
      return
    }

    setSubmitting(true)
    setError(null)
    try {
      await api.auth.changePassword(currentPassword, newPassword)
      notify('Mot de passe modifié. Reconnectez-vous avec votre nouveau mot de passe.', 'success')
      await logout()
      navigate(homeForRole(user.role))
    } catch (err) {
      setError(errorMessage(err))
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <main className="login-page">
      <div className="login-card">
        <div className="login-brand">
          <div className="brand">
            <img src={BRAND_LOGO} alt="" />
            <span>
              <strong>ALLO TOGO</strong>
              <small>STORE</small>
            </span>
          </div>
          <span className="eyebrow">Première connexion</span>
          <h1>Changez votre mot de passe</h1>
          <p>
            Votre compte <strong>{user.email}</strong> ({roleLabels[user.role]}) utilise encore le mot de passe
            provisoire envoyé par email. Choisissez un mot de passe personnel pour continuer.
          </p>
        </div>
        <form className="login-form" onSubmit={submit}>
          {error && <Alert tone="error">{error}</Alert>}
          <label>
            Mot de passe provisoire
            <input
              type="password"
              name="currentPassword"
              required
              autoComplete="current-password"
              minLength={6}
              placeholder="Reçu par email"
            />
          </label>
          <label>
            Nouveau mot de passe
            <input
              type="password"
              name="newPassword"
              required
              autoComplete="new-password"
              minLength={8}
              placeholder="8 caractères minimum"
            />
          </label>
          <label>
            Confirmer le nouveau mot de passe
            <input
              type="password"
              name="confirmation"
              required
              autoComplete="new-password"
              minLength={8}
              placeholder="Répétez le mot de passe"
            />
          </label>
          <p className="login-note">
            Le nouveau mot de passe doit contenir au moins 8 caractères, une majuscule, une minuscule et un chiffre.
            Toutes vos sessions seront déconnectées après le changement.
          </p>
          <button className="primary wide" type="submit" disabled={submitting}>
            {submitting ? 'Enregistrement…' : 'Enregistrer et me reconnecter'} <Icon name="arrow" />
          </button>
          <button
            type="button"
            className="back-link"
            onClick={() => {
              void logout()
              navigate(homeForRole(user.role))
            }}
          >
            <Icon name="arrow" /> Se déconnecter
          </button>
        </form>
      </div>
    </main>
  )
}
