# 2. Architecture de la base de données

## 2.1 Choix du SGBD : PostgreSQL 16
Pour exploiter des données foncières destinées à alimenter un CRM et des workflows IA, **PostgreSQL** s'impose pour plusieurs raisons :
- **Intégrité relationnelle stricte** : gestion native des clés étrangères et des relations `1:N` (adresses, statuts, répartitions fiscales).
- **Idempotence native** : support performant de l'instruction `INSERT ... ON CONFLICT DO UPDATE` (*UPSERT*), indispensable pour réexécuter le pipeline sans créer de doublons.
- **Types riches et JSONB** : stockage exact des montants et superficies (`BIGINT`, `NUMERIC`) et conservation des charges brutes rejetées (`JSONB`) dans la table de quarantaine `etl_rejected_records`.
- **Extensibilité géographique (PostGIS)** : possibilité d'ajouter des colonnes géométriques et un index spatial `GIST` pour enrichir les unités avec les données FGDB/GeoPackage.

---

## 2.2 Modèle conceptuel et relationnel

```mermaid
erDiagram
    municipalities ||--o{ assessment_units : "contains"
    etl_ingestion_runs ||--o{ assessment_units : "last_updated_by"
    etl_ingestion_runs ||--o{ etl_rejected_records : "logs"
    assessment_units ||--o{ assessment_addresses : "has"
    assessment_units ||--o{ assessment_owner_statuses : "has"
    assessment_units ||--o{ assessment_tax_distributions : "has"

    municipalities {
        varchar municipality_code PK
        varchar territory_name
        text source_url
        timestamptz source_modified_at
    }
    assessment_units {
        bigserial id PK
        varchar natural_key UK
        varchar municipality_code FK
        smallint roll_year
        varchar matricule_full
        varchar predominant_use_code
        numeric lot_area_sqm
        bigint total_property_value
    }
    assessment_addresses {
        bigserial id PK
        bigint assessment_unit_id FK
        smallint address_index
        varchar formatted_address
    }
    assessment_owner_statuses {
        bigserial id PK
        bigint assessment_unit_id FK
        smallint owner_index
        date registration_date
        varchar school_tax_status_code
    }
    assessment_tax_distributions {
        bigserial id PK
        bigint assessment_unit_id FK
        varchar distribution_type
        smallint distribution_index
        bigint taxable_value
    }
    etl_ingestion_runs {
        bigserial id PK
        varchar file_name
        varchar file_checksum
        varchar status
        int records_loaded
        int records_rejected
    }
    etl_rejected_records {
        bigserial id PK
        bigint run_id FK
        int record_index
        varchar error_stage
        text error_message
        jsonb raw_payload
    }