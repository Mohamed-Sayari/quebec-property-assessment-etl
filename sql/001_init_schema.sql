-- =============================================================================
-- Quebec Property Assessment Roll - PostgreSQL Schema
-- All identifiers are in English as required.
-- =============================================================================

CREATE TABLE IF NOT EXISTS municipalities (
    municipality_code VARCHAR(10) PRIMARY KEY,
    territory_name VARCHAR(255),
    source_url TEXT,
    source_modified_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS etl_ingestion_runs (
    id BIGSERIAL PRIMARY KEY,
    file_name VARCHAR(255) NOT NULL,
    file_checksum VARCHAR(64) NOT NULL,
    municipality_code VARCHAR(10),
    roll_year SMALLINT,
    schema_version VARCHAR(20),
    status VARCHAR(30) NOT NULL CHECK (
        status IN ('running', 'completed', 'completed_with_errors', 'failed')
    ),
    records_read INTEGER NOT NULL DEFAULT 0,
    records_loaded INTEGER NOT NULL DEFAULT 0,
    records_rejected INTEGER NOT NULL DEFAULT 0,
    error_summary TEXT,
    started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    finished_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS assessment_units (
    id BIGSERIAL PRIMARY KEY,
    natural_key VARCHAR(120) NOT NULL UNIQUE,
    municipality_code VARCHAR(10) NOT NULL REFERENCES municipalities(municipality_code),
    roll_year SMALLINT NOT NULL,
    borough_code VARCHAR(10),

    -- Segmented matricule (stored as strings to preserve leading zeros)
    matricule_full VARCHAR(64) NOT NULL,
    matricule_division VARCHAR(10) NOT NULL,
    matricule_section VARCHAR(10) NOT NULL,
    matricule_emplacement VARCHAR(10) NOT NULL,
    matricule_subdivision VARCHAR(10),
    matricule_building VARCHAR(10),
    matricule_unit VARCHAR(10),
    matricule_zone VARCHAR(10),
    matricule_discriminant VARCHAR(10),

    -- Identification metadata
    predominant_use_code VARCHAR(10),
    file_number VARCHAR(30),
    neighborhood_unit VARCHAR(20),
    registration_condition_code VARCHAR(5),

    -- Physical characteristics (RL03xx)
    lot_frontage_m NUMERIC(12, 2),
    lot_area_sqm NUMERIC(14, 2),
    agricultural_zone_code VARCHAR(5),
    building_floors SMALLINT,
    construction_year SMALLINT,
    construction_year_type VARCHAR(2),
    building_floor_area_sqm NUMERIC(12, 2),
    construction_type_code VARCHAR(10),
    physical_link_code VARCHAR(10),
    dwelling_units_count INTEGER,
    rental_rooms_count INTEGER,
    non_residential_units_count INTEGER,

    -- Valuation (RL04xx)
    market_reference_date DATE,
    land_value BIGINT,
    building_value BIGINT,
    total_property_value BIGINT,
    previous_roll_value BIGINT,

    -- Main fiscal classification (RL0501A..RL0503A)
    serviced_vacant_land_code VARCHAR(5),
    non_residential_class_code VARCHAR(10),
    industrial_class_code VARCHAR(10),

    -- Optional geographic coordinates (for external FGDB/GPKG enrichment)
    latitude NUMERIC(9, 6),
    longitude NUMERIC(9, 6),

    -- Audit fields
    last_run_id BIGINT REFERENCES etl_ingestion_runs(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS assessment_addresses (
    id BIGSERIAL PRIMARY KEY,
    assessment_unit_id BIGINT NOT NULL REFERENCES assessment_units(id) ON DELETE CASCADE,
    address_index SMALLINT NOT NULL,
    street_number VARCHAR(20),
    street_number_suffix VARCHAR(10),
    street_number_high VARCHAR(20),
    street_type VARCHAR(20),
    street_direction VARCHAR(10),
    street_name VARCHAR(150),
    apartment_number VARCHAR(20),
    formatted_address VARCHAR(255),
    UNIQUE (assessment_unit_id, address_index)
);

CREATE TABLE IF NOT EXISTS assessment_owner_statuses (
    id BIGSERIAL PRIMARY KEY,
    assessment_unit_id BIGINT NOT NULL REFERENCES assessment_units(id) ON DELETE CASCADE,
    owner_index SMALLINT NOT NULL,
    registration_date DATE,
    school_tax_status_code VARCHAR(5),
    UNIQUE (assessment_unit_id, owner_index)
);

CREATE TABLE IF NOT EXISTS assessment_tax_distributions (
    id BIGSERIAL PRIMARY KEY,
    assessment_unit_id BIGINT NOT NULL REFERENCES assessment_units(id) ON DELETE CASCADE,
    distribution_type VARCHAR(20) NOT NULL,
    distribution_index SMALLINT NOT NULL,
    tax_category_code VARCHAR(20),
    taxable_value BIGINT,
    non_taxable_value BIGINT,
    legal_reference_code VARCHAR(50),
    UNIQUE (assessment_unit_id, distribution_type, distribution_index)
);

CREATE TABLE IF NOT EXISTS etl_rejected_records (
    id BIGSERIAL PRIMARY KEY,
    run_id BIGINT NOT NULL REFERENCES etl_ingestion_runs(id) ON DELETE CASCADE,
    record_index INTEGER NOT NULL,
    natural_key VARCHAR(120),
    error_stage VARCHAR(30) NOT NULL CHECK (error_stage IN ('parse', 'validate', 'transform', 'load')),
    error_message TEXT NOT NULL,
    raw_payload JSONB,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- =============================================================================
-- Performance & CRM/Analytics Indexes
-- =============================================================================
CREATE INDEX IF NOT EXISTS idx_units_municipality_year
    ON assessment_units (municipality_code, roll_year);

CREATE INDEX IF NOT EXISTS idx_units_matricule
    ON assessment_units (matricule_full);

CREATE INDEX IF NOT EXISTS idx_units_cubf
    ON assessment_units (predominant_use_code);

CREATE INDEX IF NOT EXISTS idx_units_total_value
    ON assessment_units (total_property_value);

CREATE INDEX IF NOT EXISTS idx_addresses_unit_id
    ON assessment_addresses (assessment_unit_id);

CREATE INDEX IF NOT EXISTS idx_addresses_formatted
    ON assessment_addresses (formatted_address);

CREATE INDEX IF NOT EXISTS idx_rejected_run_id
    ON etl_rejected_records (run_id);