import { useState } from 'react'
import { Icon } from '../components/Icon'
import { useStore } from '../context/StoreContext'
import { errorMessage } from '../lib/api'
import { roleLabels } from '../lib/labels'
import type { StaffUser } from '../types'

export const homeForRole = (role: StaffUser['role']): string =>
  role === 'TECHNICIAN' || role === 'DELIVERY' ? '/staff' : '/admin'

export function LoginPage({
  area,
  navigate,
}: {
  area: 'admin' | 'staff'
  navigate: (path: string) => void
}) {
  const { login, user } = useStore()
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [showPassword, setShowPassword] = useState(false)

  const submit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const form = new FormData(event.currentTarget)
    setSubmitting(true)
    setError(null)
    try {
      const logged = await login(String(form.get('email') ?? ''), String(form.get('password') ?? ''))
      navigate(homeForRole(logged.role))
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
            <img
              src="https://www.allotogoconciergerietech-ia.com/wp-content/uploads/2026/02/cropped-WhatsApp-Image-2026-01-27-at-09.30.20-300x216-removebg-preview.png"
              alt="Allo Togo"
            />
            <span>
              <strong>ALLO TOGO</strong>
              <small>{area === 'admin' ? 'DIRECTION' : 'INTERVENANT'}</small>
            </span>
          </div>
          <span className="eyebrow">Espace réservé</span>
          <h1>{area === 'admin' ? 'Espace de gestion' : 'Espace intervenant'}</h1>
          <p>
            {area === 'admin'
              ? 'Connectez-vous pour piloter l’activité, suivre les commandes ou superviser l’infrastructure du site.'
              : 'Connectez-vous pour consulter vos missions, mettre à jour l’avancement et échanger avec le client.'}
          </p>
        </div>
        <form className="login-form" onSubmit={submit}>
          {user && (
            <div className="alert info">
              Vous êtes déjà connecté en tant que <strong>{user.name}</strong> ({roleLabels[user.role]}).{' '}
              <button type="button" className="text-link inline" onClick={() => navigate(homeForRole(user.role))}>
                Ouvrir mon espace
              </button>
            </div>
          )}
          {error && <div className="alert error">{error}</div>}
          <label>
            Email professionnel
            <span className="login-input-wrap">
              <Icon name="mail" size={18} />
              <input type="email" name="email" required autoComplete="username" placeholder="nom@allotogo.test" />
            </span>
          </label>
          <label>
            Mot de passe
            <span className="login-input-wrap">
              <Icon name="lock" size={18} />
              <input type={showPassword ? "text" : "password"} name="password" required autoComplete="current-password" minLength={6} />
              <button
                type="button"
                className="login-password-toggle"
                onClick={() => setShowPassword((visible) => !visible)}
                aria-label={showPassword ? "Masquer le mot de passe" : "Afficher le mot de passe"}
                aria-pressed={showPassword}
              >
                <Icon name={showPassword ? "eyeOff" : "eye"} size={18} />
              </button>
            </span>
          </label>
          <button className="primary wide" type="submit" disabled={submitting}>
            {submitting ? 'Connexion…' : 'Se connecter'} <Icon name="arrow" />
          </button>
          <p className="login-note">
            L’accès est réservé au personnel Allo Togo.
          </p>
          <button type="button" className="back-link" onClick={() => navigate('/')}>
            <Icon name="arrow" /> Retour à la boutique
          </button>
        </form>
      </div>
    </main>
  )
}
