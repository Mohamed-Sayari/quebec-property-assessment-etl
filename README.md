# Pipeline ETL — Rôles d'évaluation foncière du Québec

Pipeline automatisé en **TypeScript** et **PostgreSQL** permettant d'analyser, valider, transformer et charger les fichiers XML des rôles d'évaluation foncière publiés par le MAMH sur [Données Québec](https://www.donneesquebec.ca/recherche/dataset/roles-d-evaluation-fonciere-du-quebec).

Ce projet est conçu pour alimenter proprement un CRM immobilier et des workflows IA tout en garantissant l'idempotence et la traçabilité des imports.

---

## Architecture du dépôt

```text
quebec-property-assessment-etl/
├── README.md                     # Guide d'installation et d'exécution
├── docker-compose.yml            # Base PostgreSQL 16 (port 5433)
├── sql/
│   └── 001_init_schema.sql       # Schéma relationnel complet (7 tables + index)
├── docs/
│   ├── 01-analyse-donnees.md     # Analyse structurelle et pièges du jeu de données
│   ├── 02-architecture-bdd.md    # Modèle conceptuel (ERD) et justifications
│   └── 03-processus-etl.md       # Conception ETL, erreurs et réexécutions
├── data/sample/                  # Échantillon local utilisé pour les tests
├── src/
│   ├── config/                   # Chargement des variables d'environnement
│   ├── types/                    # Interfaces TypeScript métier
│   ├── utils/                    # Calcul SHA-256 en streaming
│   ├── parser/                   # Parseur XML streaming (SAX) + index CSV
│   ├── transformer/              # Mapping RLxxxx -> modèle métier normalisé
│   ├── validator/                # Validation stricte par schéma Zod
│   ├── loader/                   # Chargement batch PostgreSQL + SAVEPOINT + UPSERT
│   └── index.ts                  # Point d'entrée CLI
└── tests/                        # Tests unitaires (Vitest)
```

---

## Prérequis

- **Node.js** >= 20 et **npm**
- **Docker** et **Docker Compose**

---

## Installation et configuration

1. Cloner le dépôt et installer les dépendances :

```bash
git clone https://github.com/Mohamed-Sayari/quebec-property-assessment-etl.git
cd quebec-property-assessment-etl
npm install
```

2. Créer le fichier `.env` à partir du modèle fourni :

```bash
# Linux / macOS / Git Bash
cp .env.example .env

# Windows (CMD)
copy .env.example .env
```

3. Démarrer PostgreSQL 16 (port `5433`) — le schéma `sql/001_init_schema.sql` est initialisé automatiquement au premier démarrage :

```bash
docker compose up -d
docker compose ps
```

---

## Exécution du pipeline ETL

### Importer tout un dossier de fichiers XML

```bash
npm run ingest -- --dir data/sample
```

### Importer un fichier XML spécifique

```bash
npm run ingest -- --file data/sample/RM01042.xml
```

### Réexécution idempotente (ignorer les fichiers inchangés via SHA-256)

```bash
npm run ingest -- --dir data/sample --skip-unchanged
```

### Options CLI disponibles

| Option | Description |
| --- | --- |
| `--file <chemin>` | Importe un fichier XML spécifique (option répétable) |
| `--dir <dossier>` | Importe tous les fichiers `.xml` d'un dossier |
| `--index <csv>` | Chemin vers le CSV d'index municipal (par défaut : `data/sample/indexRole2026.csv` s'il existe) |
| `--skip-unchanged` | Ignore les fichiers dont le checksum SHA-256 correspond déjà à un run `completed` |

### Résultat vérifié sur l'échantillon local (`data/sample/`)

- `indexRole2026.csv` : **1 134 municipalités** indexées
- `RM01042.xml` : **594 unités** lues et chargées (`0` rejetée)
- `RM02005.xml` : **3 741 unités** lues et chargées (`0` rejetée)
- **Total chargé** : **4 335 unités d'évaluation** (réexécution vérifiée sans doublon par UPSERT et par checksum SHA-256).

---

## Tests et vérification TypeScript

```bash
# Vérification stricte des types TypeScript
npx tsc --noEmit

# Exécution des tests unitaires (Vitest)
npm test

# Compilation JavaScript vers dist/
npm run build
```

---

## Documentation technique (en français)

- [01 - Analyse des données](docs/01-analyse-donnees.md) : structure XML (`RLxxxx`), contenu métier et pièges du jeu de données.
- [02 - Architecture de base de données](docs/02-architecture-bdd.md) : modèle relationnel (7 tables), ERD et justifications.
- [03 - Processus ETL](docs/03-processus-etl.md) : lecture streaming SAX, validation Zod, gestion d'erreurs par `SAVEPOINT` et idempotence.

---

## Sous-ensemble utilisé, hypothèses et limites

- **Sous-ensemble de données utilisé** : en raison de la volumétrie globale (>1 130 municipalités), les tests d'intégration locaux ont été validés sur deux fichiers représentatifs du rôle 2026 (`RM01042.xml` avec 594 unités et `RM02005.xml` avec 3 741 unités) accompagnés de l'index `indexRole2026.csv`.
- **Téléchargement automatique** : laissé hors périmètre conformément à la consigne (démarrage depuis un jeu de fichiers local) ; l'index CSV contient toutefois les URL sources (`source_url`) permettant d'ajouter ultérieurement une étape de téléchargement automatisée.
- **Données caviardées** : conformément aux règles de diffusion ouverte du MAMH, les noms des propriétaires, leurs adresses postales et les numéros de cadastre sont absents/masqués dans les fichiers XML publics.
- **Données géographiques** : les colonnes `latitude` et `longitude` sont prévues dans la table `assessment_units` pour un enrichissement ultérieur (jointure matricule avec les fichiers FGDB/GPKG ou extension PostGIS), mais ne sont pas présentes dans les fichiers XML du rôle.
- **Isolation des erreurs** : les enregistrements invalides au parsing, à la transformation ou à la validation Zod sont isolés dans `etl_rejected_records` (avec `SAVEPOINT` côté SQL) afin de ne pas bloquer l'ingestion des autres unités.