# Configurer l’envoi des emails avec Gmail API sur Render

Ce guide configure l’application pour envoyer les emails du personnel avec l’API Gmail par HTTPS.
Il n’utilise pas SMTP, le mot de passe Gmail ni le mot de passe d’application Google.

## Avant de commencer

Le journal partagé précédemment contenait un secret OAuth et un code d’autorisation. Considère
ces valeurs comme compromises : dans Google Cloud, supprime l’ancien client OAuth ou remplace son
secret. Ne réutilise pas les valeurs précédemment partagées. Ne colle jamais de secret, code ou
jeton dans un message, un dépôt Git ou une capture d’écran publique.

Il faut un compte Gmail qui servira d’expéditeur et l’accès au service Render.

## 1. Créer un projet Google Cloud et activer Gmail API

1. Ouvre la [Google Cloud Console](https://console.cloud.google.com/).
2. Crée un projet ou sélectionne celui qui hébergera l’application OAuth.
3. Ouvre la page [d’activation de Gmail API](https://console.cloud.google.com/apis/enableflow;apiid=gmail.googleapis.com).
4. Vérifie le projet sélectionné, puis clique sur **Activer**.

## 2. Configurer l’écran de consentement OAuth

1. Dans le menu, ouvre **Google Auth Platform → Branding**. Si Google propose de configurer
   l’écran, clique sur **Get started**.
2. Donne un nom à l’application, par exemple `Allo-Togo Store`, et renseigne une adresse de contact.
3. Pour un compte Gmail personnel, choisis le type d’utilisateur **External**.
4. Dans **Google Auth Platform → Audience**, laisse l’application en mode **Testing** pendant la
   configuration et ajoute le compte Gmail expéditeur dans **Test users**.
5. Dans **Google Auth Platform → Data Access**, ajoute uniquement le scope :
   `https://www.googleapis.com/auth/gmail.send`

Le compte utilisé plus tard dans OAuth Playground doit être celui ajouté comme testeur et celui
qui enverra réellement les messages.

## 3. Créer le client OAuth

1. Ouvre **Google Auth Platform → Clients**, puis clique sur **Create client**.
2. Choisis **Web application**.
3. Donne-lui un nom, par exemple `Allo-Togo Render`.
4. Dans **Authorized redirect URIs**, ajoute exactement :
   `https://developers.google.com/oauthplayground`
5. Clique sur **Create**.
6. Copie le **Client ID** et le **Client secret** du nouveau client dans un gestionnaire de mots de
   passe temporaire. Google peut ne plus afficher le secret ensuite.

Le client ID et le secret doivent venir du même client OAuth. Ne saisis pas une clé API à la place du
client secret.

## 4. Obtenir le refresh token dans OAuth Playground

1. Ouvre [OAuth 2.0 Playground](https://developers.google.com/oauthplayground/).
2. Clique sur l’icône ⚙️ en haut à droite.
3. Coche **Use your own OAuth credentials**.
4. Colle le **Client ID** et le **Client secret** du client créé à l’étape précédente, puis ferme les
   paramètres.
5. Dans **Step 1 — Select & authorize APIs**, saisis ce scope :
   `https://www.googleapis.com/auth/gmail.send`
6. Clique sur **Authorize APIs**. Connecte-toi au compte Gmail qui figure dans **Test users**, puis
   accepte l’autorisation. Si Google affiche une page de confirmation pour une application en test,
   vérifie le nom puis continue uniquement si c’est bien ton projet.
7. Dans **Step 2 — Exchange authorization code for tokens**, clique sur **Exchange authorization
   code for tokens**.
8. Après un échange réussi, repère **Refresh token** dans les résultats et copie cette valeur. Ne
   copie pas l’**Access token** : ce dernier expire rapidement.

La case **Auto-refresh** ne crée pas le refresh token. Elle renouvelle l’access token après que les
jetons ont été obtenus.

### Si le refresh token n’apparaît pas

- Confirme que **Use your own OAuth credentials** est coché et que le Client ID et le secret
  proviennent du même client.
- Vérifie que le type du client est **Web application** et que l’URI de redirection est exactement
  celle indiquée plus haut.
- Vérifie que tu autorises le compte ajouté comme **Test user** et que le scope demandé est
  `https://www.googleapis.com/auth/gmail.send`.
- Après une autorisation antérieure, retire l’accès de l’application dans
  [les connexions de ton compte Google](https://myaccount.google.com/connections), puis reprends le
  parcours depuis OAuth Playground et accepte de nouveau.
- Si l’étape d’échange affiche `401 invalid_client` ou **The provided client secret is invalid**,
  l’échange n’a pas généré de refresh token. Révoque/remplace le secret compromis, puis recommence
  avec le nouveau couple Client ID / Client secret. Ne partage pas le détail HTTP brut : il peut
  contenir le code d’autorisation ou des identifiants.

## 5. Renseigner les variables dans Render

Dans **Render → ton service → Environment**, configure :

| Variable | Valeur |
| --- | --- |
| `EMAIL_PROVIDER` | `google` |
| `GMAIL_CLIENT_ID` | Client ID OAuth |
| `GMAIL_CLIENT_SECRET` | Client secret OAuth actuel |
| `GMAIL_REFRESH_TOKEN` | Refresh token obtenu à l’étape 4 |
| `MAIL_USERNAME` | Adresse Gmail ayant autorisé l’application |
| `MAIL_FROM_NAME` | `Allo-Togo Shop` |

Enregistre les changements et attends que le service ait redémarré/déployé. Le fichier `.env` de ton
ordinateur n’est pas chargé automatiquement par Render. N’ajoute pas les valeurs secrètes au dépôt.

## 6. Tester l’envoi

1. Attends que le service Render soit opérationnel.
2. Dans l’application, essaie de créer un membre du personnel avec une adresse email que tu peux
   consulter.
3. Si l’opération échoue, consulte les logs Render et cherche
   `Échec de l’envoi des identifiants du nouveau compte`.
4. Partage uniquement le texte d’erreur utile, après avoir retiré les adresses personnelles,
   codes, secrets, jetons et en-têtes HTTP.

## Limite du mode de test Google

En mode **Testing**, Google peut faire expirer le refresh token après 7 jours pour les applications
externes. Si cela arrive, le consentement OAuth et l’obtention d’un nouveau refresh token devront
être refaits. Pour un usage durable, consulte les exigences Google de publication/vérification OAuth
avant de passer l’application en production. Ne passe pas en production uniquement pour contourner
un problème de configuration.
