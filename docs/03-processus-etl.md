# 3. Conception du processus d'importation automatisé (ETL)

## 3.1 Vue d'ensemble du pipeline

Le pipeline ETL implémenté en **TypeScript** suit une architecture modulaire en 4 étapes, conçue pour traiter de gros volumes XML sans saturation mémoire :

```text
[Fichier CSV Index] ──┐
                      ▼
[Fichier XML local] ──► 1. Extract (Streaming SAX + SHA-256)
                      │
                      ▼
                   2. Transform (Mapping RLxxxx -> modèle métier, clé naturelle)
                      │
                      ▼
                   3. Validate (Schéma Zod strict par enregistrement)
                      │
                      ├──► Invalide ──► Table de quarantaine (etl_rejected_records)
                      │
                      ▼ Valide (par lots de 250)
                   4. Load (Transaction PostgreSQL + SAVEPOINT + UPSERT)
```

---

## 3.2 Détail des étapes

### 1. Lecture (Extract)
- **Index municipal CSV (`csvIndexParser.ts`)** : charge la table de correspondance des municipalités (`indexRole2026.csv`) pour enrichir les noms de territoires et les URL sources.
- **Empreinte SHA-256 en streaming (`hash.ts`)** : calcule le hash du fichier XML sans le charger en mémoire.
- **Parseur XML événementiel SAX (`xmlStreamParser.ts`)** : lit le fichier XML balise par balise (`sax`) afin de maintenir une empreinte mémoire constante (`O(1)` par unité), y compris sur des municipalités de plusieurs centaines de milliers d'unités.

### 2. Transformation (Transform)
- **`assessmentTransformer.ts`** convertit chaque bloc `<RLUEx>` et ses sous-balises cryptiques (`RL01xx`..`RL05xx`) en un objet TypeScript normalisé (`AssessmentUnitInput`).
- Normalise les décimales à virgule française (ex. `12,50` → `12.50`), reconstruit les adresses formatées (numéro civique, direction cardinale, numéro d'appartement) et génère la clé métier déterministe (`natural_key`).

### 3. Validation (Validate)
- **`assessmentValidator.ts`** applique un schéma **Zod** strict sur chaque enregistrement transformé :
  - présence obligatoire du matricule et de la clé naturelle ;
  - cohérence des types numériques (pas de valeurs foncières négatives) ;
  - validation des tableaux imbriqués (adresses, statuts, répartitions fiscales).
- Les enregistrements invalides sont immédiatement détournés vers le tampon de quarantaine (`etl_rejected_records`) avec le message d'erreur détaillé, sans interrompre le flux.

### 4. Chargement (Load)
- **`assessmentLoader.ts`** regroupe les enregistrements valides par lots (`BATCH_SIZE=250` par défaut) dans une transaction PostgreSQL :
  - `INSERT ... ON CONFLICT (natural_key) DO UPDATE` sur `assessment_units` ;
  - synchronisation propre des tables enfants (`assessment_addresses`, `assessment_owner_statuses`, `assessment_tax_distributions`) pour refléter fidèlement l'état courant du rôle.

---

## 3.3 Gestion des erreurs et résilience (`SAVEPOINT`)

Le pipeline distingue deux niveaux d'erreurs :
1. **Erreurs unitaires (isolées)** :
   - Au niveau **Transform / Validate** : l'unité fautive est capturée et enregistrée dans `etl_rejected_records` (`error_stage = 'transform' | 'validate'`).
   - Au niveau **Load SQL** : chaque unité dans un lot est protégée par un **`SAVEPOINT`** PostgreSQL. En cas d'échec SQL sur un enregistrement particulier (ex. violation de contrainte), seul le `SAVEPOINT` de cet enregistrement est annulé (`ROLLBACK TO SAVEPOINT`), le lot continue pour les 249 autres unités, et l'erreur est journalisée dans `etl_rejected_records` (`error_stage = 'load'`).
   - Le run se termine alors avec le statut `completed_with_errors`.
2. **Erreurs fatales (fichier / infrastructure)** :
   - XML structurellement corrompu, fichier absent ou perte de connexion DB : le run est marqué `failed` dans `etl_ingestion_runs` avec `error_summary` et le processus retourne un code de sortie non nul (`exit 1`).

---

## 3.4 Stratégie de réexécution et idempotence

Le système garantit qu'une réexécution ne crée **jamais de doublons** grâce à une double protection :
1. **Niveau fichier (`--skip-unchanged`)** : si le checksum SHA-256 du fichier correspond déjà à un run `completed` dans `etl_ingestion_runs`, le fichier est ignoré instantanément (`[SKIP]`).
2. **Niveau enregistrement (`UPSERT` par `natural_key`)** : si le fichier est réimporté (nouvelle version du rôle ou relance forcée sans `--skip-unchanged`), les unités existantes sont mises à jour de façon idempotente sans duplication.

---

## 3.5 Hypothèses, limites et pistes d'évolution

- **Automatisation du téléchargement (Bonus)** : le téléchargement depuis Données Québec étant hors périmètre (restrictions pare-feu), le pipeline démarre sur des fichiers locaux. L'architecture permet toutefois d'ajouter en amont un module `fetcher` exploitant la colonne `source_url` déjà extraite depuis `indexRole2026.csv`.
- **Passage à l'échelle nationale** : pour ingérer les 1 134 municipalités en une seule passe, il suffirait de paralléliser les fichiers par file de workers tout en conservant un pool PostgreSQL borné.