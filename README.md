# QReview

Application web de collecte d'avis entreprises avec vérification SIRET et OAuth LinkedIn.

## Fonctionnalités

### Côté utilisateur
- **Soumission d'avis** avec formulaire validé
- **Vérification d'entreprise** via API SIRET (INSEE)
- **Vérification d'identité** via LinkedIn OAuth (optionnel)
- **Consultation des avis** avec pagination et tri
- **Pages dédiées** par entreprise et avis individuel
- **Design responsive** avec thème clair/sombre
- **Partage social** avec Web Share API

### Côté admin
- **Panel d'administration** protégé par mot de passe
- **Modération des avis** (validation, suppression, réponse)
- **Actions groupées** (validation/suppression en masse)
- **Filtrage et recherche** d'avis
- **Export CSV** des données
- **Génération QR code** (admin uniquement)
- **Statistiques** en temps réel

## Déploiement sur Railway

### 1. Prérequis

- Un compte Railway (https://railway.app/)
- Git installé sur votre machine

### 2. Initialiser et pousser sur GitHub

```bash
cd QReview
git init
git add .
git commit -m "Initial commit"

# Créer le repo sur GitHub puis
git remote add origin https://github.com/VOTRE_USERNAME/qreview.git
git branch -M main
git push -u origin main
```

### 3. Déployer sur Railway

1. Allez sur https://railway.app/
2. Cliquez sur "New Project" → "Deploy from GitHub repo"
3. Sélectionnez votre repository

### 4. Configurer la base de données

Cliquez sur "New Service" → "Database" → "PostgreSQL"

Railway créera automatiquement la variable `DATABASE_URL`.

### 5. Configurer les variables d'environnement

Dans l'onglet "Variables" de votre projet Railway, ajoutez :

#### Obligatoires

```bash
# Application
NODE_ENV=production
BASE_URL=https://votre-app.railway.app
PORT=3000

# Admin
ADMIN_PASSWORD=votre_mot_de_passe_admin

# Session (sécurité)
SESSION_SECRET=chaine_aleatoire_longue_et_securisee
```

#### Optionnelles - LinkedIn OAuth

Pour permettre la vérification d'identité LinkedIn :

1. Créez une app sur https://www.linkedin.com/developers/apps
2. Ajoutez les Redirect URLs :
   - Dev : `http://localhost:3000/auth/linkedin/callback`
   - Prod : `https://votre-app.railway.app/auth/linkedin/callback`
3. Activez "Sign In with LinkedIn using OpenID Connect"

```bash
LINKEDIN_CLIENT_ID=votre_client_id
LINKEDIN_CLIENT_SECRET=votre_client_secret
```

### 6. Accéder à l'application

- **Public** : `https://votre-app.railway.app`
- **Admin** : `https://votre-app.railway.app/admin`

## Développement local

1. Installez les dépendances :
```bash
npm install
```

2. Configurez l'environnement :
```bash
cp .env.example .env
# Éditez .env avec vos valeurs
```

3. Lancez le serveur :
```bash
npm start
```

L'application sera accessible sur http://localhost:3000

## Tests

```bash
npm test
```

## Structure du projet

```
QReview/
├── src/
│   ├── server.js          # Serveur Express
│   ├── db/                # Couche d'abstraction DB (SQLite/PostgreSQL)
│   ├── routes/            # API routes
│   ├── middleware/        # Auth, rate limiting, error handling
│   └── utils/             # Validators, logger, SIRET API
├── public/
│   ├── index.html         # Page d'accueil
│   ├── admin.html         # Panel admin
│   ├── company.html       # Page entreprise
│   ├── review.html        # Page avis individuel
│   ├── css/               # Styles
│   └── js/                # Scripts client
├── tests/                 # Tests API
└── package.json
```

## API Endpoints

### Public
- `GET /health` - Health check
- `GET /api/reviews` - Liste des avis validés (paginée)
- `GET /api/reviews/:id` - Avis individuel
- `GET /api/reviews/stats` - Statistiques globales
- `POST /api/reviews` - Soumettre un avis
- `POST /api/reviews/:id/flag` - Signaler un avis
- `GET /auth/linkedin` - Initier LinkedIn OAuth
- `GET /auth/linkedin/callback` - Callback OAuth

### Admin (protégé)
- `POST /admin/login` - Connexion admin
- `POST /admin/logout` - Déconnexion
- `GET /admin/reviews` - Liste tous les avis
- `PUT /admin/reviews/:id/validate` - Valider un avis
- `DELETE /admin/reviews/:id` - Supprimer un avis
- `POST /admin/reviews/bulk/validate` - Validation groupée
- `POST /admin/reviews/bulk/delete` - Suppression groupée
- `POST /admin/reviews/:id/reply` - Répondre à un avis
- `PUT /admin/reviews/:id/flag` - Marquer/démarquer
- `GET /admin/export/csv` - Export CSV
- `GET /admin/api/qrcode` - QR code (admin)

## Sécurité

- Rate limiting sur toutes les routes API
- Protection contre les injections SQL (requêtes préparées)
- Validation des entrées utilisateur
- Session HTTP-only et secure en production
- Headers de sécurité via Helmet
- Vérification SIRET pour confirmer l'existence de l'entreprise

## License

ISC
