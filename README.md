# QReview

Application de collecte d'avis entreprises accessible via QR code.

## Fonctionnalites

- Formulaire de soumission d'avis avec validation par email
- Affichage des avis valides
- QR code genere automatiquement pour faciliter l'acces
- Design responsive et moderne

## Deploiement sur Railway

### 1. Prerequis

- Un compte Railway (https://railway.app/)
- Git installe sur votre machine

### 2. Initialiser Git

```bash
cd QReview
git init
git add .
git commit -m "Initial commit"
```

### 3. Creer un repository GitHub

1. Allez sur https://github.com/new
2. Crez un nouveau repository (ex: `qreview`)
3. Poussez votre code :

```bash
git remote add origin https://github.com/VOTRE_USERNAME/qreview.git
git branch -M main
git push -u origin main
```

### 4. Deployer sur Railway

1. Allez sur https://railway.app/
2. Cliquez sur "New Project"
3. Selectionnez "Deploy from GitHub repo"
4. Choisissez votre repository `qreview`

### 5. Configurer les variables d'environnement

Dans votre projet Railway, allez dans l'onglet "Variables" et ajoutez :

#### Pour la base de donnees :
Railway va automatiquement creer `DATABASE_URL` quand vous ajouterez un service PostgreSQL.

Cliquez sur "New Service" -> "Database" -> "PostgreSQL"

#### Pour les emails (recommande pour utiliser des emails reels) :

**Option 1 - Gmail (gratuit)** :
- Activez la verification en 2 etapes sur votre compte Google
- Crez un "Mot de passe d'application" : https://myaccount.google.com/apppasswords
- Utilisez ces variables :
  - `SMTP_HOST` = `smtp.gmail.com`
  - `SMTP_PORT` = `587`
  - `SMTP_USER` = `votre-email@gmail.com`
  - `SMTP_PASS` = `le-mot-de-passe-d-application`

**Option 2 - Brevo (anciennement Sendinblue, gratuit jusqu'a 300 emails/jour)** :
- Crez un compte sur https://www.brevo.com/
- Allez dans Parametres -> Cles API SMTP
- Utilisez ces variables :
  - `SMTP_HOST` = `smtp-relay.brevo.com`
  - `SMTP_PORT` = `587`
  - `SMTP_USER` = `votre-login-brevo`
  - `SMTP_PASS` = `votre-cle-api-smtp`

#### Variables generales :
- `BASE_URL` = `https://votre-app.railway.app` (l'URL de votre app Railway)
- `EMAIL_FROM` = `noreply@votre-domaine.com` (adresse d'envoi)
- `NODE_ENV` = `production`

### 6. Redeployer

Apres avoir configure les variables, Railway redeploiera automatiquement votre application.

### 7. Obtenir le QR Code

Une fois deploye, votre application sera accessible a l'URL Railway. Vous pouvez :
1. Telecharger le QR code directement depuis la page d'accueil
2. L'imprimer et le coller sur votre CV

## Developpement local

1. Copiez `.env.example` vers `.env`
2. Configurez les variables d'environnement dans `.env`
3. Lancez le serveur :

```bash
npm install
npm start
```

L'application sera accessible sur http://localhost:3000

## Structure du projet

```
QReview/
├── src/
│   └── server.js         # Backend Express
├── public/
│   ├── index.html        # Page d'accueil
│   ├── css/
│   │   └── style.css     # Styles
│   └── js/
│       └── script.js     # Scripts client
├── .env.example          # Exemple de configuration
├── railway.json          # Configuration Railway
└── package.json          # Dependances
```

## API Endpoints

- `POST /api/reviews` - Soumettre un avis
- `GET /api/reviews` - Recuperer les avis valides
- `GET /api/validate/:token` - Valider un avis
- `GET /api/qrcode` - Obtenir le QR code
- `GET /health` - Health check
