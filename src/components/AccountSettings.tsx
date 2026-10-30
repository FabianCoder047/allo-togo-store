import { useState } from "react"
import { Icon } from "./Icon"
import { Alert } from "./ui"
import { useStore } from "../context/StoreContext"
import { api, errorMessage } from "../lib/api"
import { roleLabels } from "../lib/labels"
import { homeForRole } from "../pages/LoginPage"
import type { StaffUser } from "../types"

const splitName = (user: StaffUser) => {
  const firstName = user.firstName?.trim()
  const lastName = user.lastName?.trim()
  if (firstName || lastName) {
    return { firstName: firstName ?? "", lastName: lastName ?? "" }
  }
  const full = user.name.trim()
  const separator = full.indexOf(" ")
  if (separator < 0) return { firstName: full, lastName: "" }
  return {
    firstName: full.slice(0, separator),
    lastName: full.slice(separator + 1).trim(),
  }
}

const passwordIssues = (password: string) => {
  if (password.length < 8)
    return "Le mot de passe doit contenir au moins 8 caractères."
  if (!/[A-Z]/.test(password))
    return "Le mot de passe doit contenir une majuscule."
  if (!/[a-z]/.test(password))
    return "Le mot de passe doit contenir une minuscule."
  if (!/[0-9]/.test(password))
    return "Le mot de passe doit contenir un chiffre."
  return null
}

/**
 * Paramètres du compte, communs à tous les profils : chaque membre met à jour
 * ses noms, son téléphone et son mot de passe. L’email professionnel reste
 * géré par l’administration.
 */
export function AccountSettings({
  navigate,
}: {
  navigate: (path: string) => void
}) {
  const { user, notify, refreshUser, logout } = useStore()
  const initial = user ? splitName(user) : { firstName: "", lastName: "" }
  const [firstName, setFirstName] = useState(initial.firstName)
  const [lastName, setLastName] = useState(initial.lastName)
  const [phone, setPhone] = useState(user?.phone ?? "")
  const [profileError, setProfileError] = useState<string | null>(null)
  const [savingProfile, setSavingProfile] = useState(false)
  const [passwordError, setPasswordError] = useState<string | null>(null)
  const [savingPassword, setSavingPassword] = useState(false)

  if (!user) return null

  const saveProfile = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!firstName.trim() || !lastName.trim()) {
      setProfileError("Le prénom et le nom sont obligatoires.")
      return
    }
    setSavingProfile(true)
    setProfileError(null)
    try {
      await api.auth.updateProfile({
        firstName: firstName.trim(),
        lastName: lastName.trim(),
        phone: phone.trim() || null,
      })
      await refreshUser()
      notify("Vos informations ont été mises à jour.", "success")
    } catch (error) {
      setProfileError(errorMessage(error))
    } finally {
      setSavingProfile(false)
    }
  }

  const savePassword = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const form = new FormData(event.currentTarget)
    const currentPassword = String(form.get("currentPassword") ?? "")
    const newPassword = String(form.get("newPassword") ?? "")
    const confirmation = String(form.get("confirmation") ?? "")

    if (newPassword !== confirmation) {
      setPasswordError("Les deux nouveaux mots de passe ne correspondent pas.")
      return
    }
    const issue = passwordIssues(newPassword)
    if (issue) {
      setPasswordError(issue)
      return
    }

    setSavingPassword(true)
    setPasswordError(null)
    try {
      await api.auth.changePassword(currentPassword, newPassword)
      notify(
        "Mot de passe modifié. Reconnectez-vous avec votre nouveau mot de passe.",
        "success",
      )
      await logout()
      navigate(homeForRole(user.role))
    } catch (error) {
      setPasswordError(errorMessage(error))
    } finally {
      setSavingPassword(false)
    }
  }

  return (
    <div className="admin-overview-grid">
      <div className="admin-panel">
        <div className="admin-panel-head">
          <div>
            <h2>Mes informations</h2>
            <p>
              Ces données apparaissent sur vos missions et dans les
              notifications.
            </p>
          </div>
        </div>
        <form className="staff-modal-form" onSubmit={saveProfile}>
          <div className="staff-modal-fields account-fields">
            {profileError && (
              <div className="account-wide">
                <Alert tone="error">{profileError}</Alert>
              </div>
            )}
            <label>
              Prénom
              <input
                name="firstName"
                value={firstName}
                onChange={(event) => setFirstName(event.target.value)}
                required
                maxLength={60}
                autoComplete="given-name"
              />
            </label>
            <label>
              Nom
              <input
                name="lastName"
                value={lastName}
                onChange={(event) => setLastName(event.target.value)}
                required
                maxLength={60}
                autoComplete="family-name"
              />
            </label>
            <label>
              Téléphone
              <input
                name="phone"
                value={phone}
                onChange={(event) => setPhone(event.target.value)}
                maxLength={30}
                inputMode="tel"
                autoComplete="tel"
                placeholder="+228 90 00 00 00"
              />
            </label>
            <label>
              Email professionnel
              <input name="email" value={user.email} readOnly disabled />
            </label>
            <label className="account-wide">
              Rôle
              <input
                name="role"
                value={roleLabels[user.role]}
                readOnly
                disabled
              />
            </label>
          </div>
          <div className="staff-modal-actions">
            <button className="primary" type="submit" disabled={savingProfile}>
              {savingProfile ? "Enregistrement…" : "Enregistrer"}{" "}
              <Icon name="check" size={16} />
            </button>
          </div>
        </form>
      </div>

      <div className="admin-panel">
        <div className="admin-panel-head">
          <div>
            <h2>Mot de passe</h2>
            <p>8 caractères minimum, avec majuscule, minuscule et chiffre.</p>
          </div>
        </div>
        <form className="staff-modal-form" onSubmit={savePassword}>
          <div className="staff-modal-fields account-fields account-password-fields">
            {passwordError && (
              <div className="account-wide">
                <Alert tone="error">{passwordError}</Alert>
              </div>
            )}
            <label className="account-wide">
              Mot de passe actuel
              <input
                type="password"
                name="currentPassword"
                required
                autoComplete="current-password"
                placeholder="Votre mot de passe actuel"
              />
            </label>
            <label>
              Nouveau mot de passe
              <input
                type="password"
                name="newPassword"
                required
                minLength={8}
                autoComplete="new-password"
                placeholder="8 caractères minimum"
              />
            </label>
            <label>
              Confirmation
              <input
                type="password"
                name="confirmation"
                required
                minLength={8}
                autoComplete="new-password"
                placeholder="Répétez le mot de passe"
              />
            </label>
            <p className="login-note account-wide">
              Toutes vos sessions seront déconnectées après le changement : vous
              devrez vous reconnecter.
            </p>
          </div>
          <div className="staff-modal-actions">
            <button className="primary" type="submit" disabled={savingPassword}>
              {savingPassword ? "Modification…" : "Changer le mot de passe"}{" "}
              <Icon name="lock" size={16} />
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
