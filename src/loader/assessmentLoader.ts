import { Pool, PoolClient } from "pg";
import {
  AssessmentUnitInput,
  MunicipalityIndexEntry,
  RejectedRecordInput,
  RollHeader,
} from "../types/assessment";

export async function findCompletedRunByChecksum(
  pool: Pool,
  fileChecksum: string
): Promise<number | null> {
  const res = await pool.query<{ id: string }>(
    `SELECT id FROM etl_ingestion_runs
     WHERE file_checksum = $1 AND status = 'completed'
     ORDER BY id DESC LIMIT 1`,
    [fileChecksum]
  );
  return res.rows[0] ? Number(res.rows[0].id) : null;
}

export async function createIngestionRun(
  pool: Pool,
  fileName: string,
  fileChecksum: string
): Promise<number> {
  const res = await pool.query<{ id: string }>(
    `INSERT INTO etl_ingestion_runs (file_name, file_checksum, status)
     VALUES ($1, $2, 'running')
     RETURNING id`,
    [fileName, fileChecksum]
  );
  return Number(res.rows[0].id);
}

export async function ensureMunicipalityAndUpdateRun(
  pool: Pool,
  runId: number,
  header: RollHeader,
  indexEntry?: MunicipalityIndexEntry
): Promise<void> {
  await pool.query(
    `INSERT INTO municipalities (municipality_code, territory_name, source_url, source_modified_at)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (municipality_code) DO UPDATE SET
       territory_name = COALESCE(EXCLUDED.territory_name, municipalities.territory_name),
       source_url = COALESCE(EXCLUDED.source_url, municipalities.source_url),
       source_modified_at = COALESCE(EXCLUDED.source_modified_at, municipalities.source_modified_at),
       updated_at = NOW()`,
    [
      header.municipalityCode,
      indexEntry?.territoryName ?? null,
      indexEntry?.sourceUrl ?? null,
      indexEntry?.sourceModifiedAt ?? null,
    ]
  );

  await pool.query(
    `UPDATE etl_ingestion_runs
     SET municipality_code = $1, roll_year = $2, schema_version = $3
     WHERE id = $4`,
    [header.municipalityCode, header.rollYear, header.schemaVersion, runId]
  );
}

async function upsertSingleUnit(
  client: PoolClient,
  runId: number,
  unit: AssessmentUnitInput
): Promise<void> {
  const unitRes = await client.query<{ id: string }>(
    `INSERT INTO assessment_units (
      natural_key, municipality_code, roll_year, borough_code,
      matricule_full, matricule_division, matricule_section, matricule_emplacement,
      matricule_subdivision, matricule_building, matricule_unit, matricule_zone, matricule_discriminant,
      predominant_use_code, file_number, neighborhood_unit, registration_condition_code,
      lot_frontage_m, lot_area_sqm, agricultural_zone_code, building_floors,
      construction_year, construction_year_type, building_floor_area_sqm,
      construction_type_code, physical_link_code, dwelling_units_count,
      rental_rooms_count, non_residential_units_count,
      market_reference_date, land_value, building_value, total_property_value, previous_roll_value,
      serviced_vacant_land_code, non_residential_class_code, industrial_class_code,
      last_run_id, updated_at
    ) VALUES (
      $1, $2, $3, $4,
      $5, $6, $7, $8,
      $9, $10, $11, $12, $13,
      $14, $15, $16, $17,
      $18, $19, $20, $21,
      $22, $23, $24,
      $25, $26, $27,
      $28, $29,
      $30, $31, $32, $33, $34,
      $35, $36, $37,
      $38, NOW()
    )
    ON CONFLICT (natural_key) DO UPDATE SET
      borough_code = EXCLUDED.borough_code,
      matricule_subdivision = EXCLUDED.matricule_subdivision,
      matricule_building = EXCLUDED.matricule_building,
      matricule_unit = EXCLUDED.matricule_unit,
      matricule_zone = EXCLUDED.matricule_zone,
      matricule_discriminant = EXCLUDED.matricule_discriminant,
      predominant_use_code = EXCLUDED.predominant_use_code,
      file_number = EXCLUDED.file_number,
      neighborhood_unit = EXCLUDED.neighborhood_unit,
      registration_condition_code = EXCLUDED.registration_condition_code,
      lot_frontage_m = EXCLUDED.lot_frontage_m,
      lot_area_sqm = EXCLUDED.lot_area_sqm,
      agricultural_zone_code = EXCLUDED.agricultural_zone_code,
      building_floors = EXCLUDED.building_floors,
      construction_year = EXCLUDED.construction_year,
      construction_year_type = EXCLUDED.construction_year_type,
      building_floor_area_sqm = EXCLUDED.building_floor_area_sqm,
      construction_type_code = EXCLUDED.construction_type_code,
      physical_link_code = EXCLUDED.physical_link_code,
      dwelling_units_count = EXCLUDED.dwelling_units_count,
      rental_rooms_count = EXCLUDED.rental_rooms_count,
      non_residential_units_count = EXCLUDED.non_residential_units_count,
      market_reference_date = EXCLUDED.market_reference_date,
      land_value = EXCLUDED.land_value,
      building_value = EXCLUDED.building_value,
      total_property_value = EXCLUDED.total_property_value,
      previous_roll_value = EXCLUDED.previous_roll_value,
      serviced_vacant_land_code = EXCLUDED.serviced_vacant_land_code,
      non_residential_class_code = EXCLUDED.non_residential_class_code,
      industrial_class_code = EXCLUDED.industrial_class_code,
      last_run_id = EXCLUDED.last_run_id,
      updated_at = NOW()
    RETURNING id`,
    [
      unit.naturalKey,
      unit.municipalityCode,
      unit.rollYear,
      unit.boroughCode,
      unit.matriculeFull,
      unit.matriculeDivision,
      unit.matriculeSection,
      unit.matriculeEmplacement,
      unit.matriculeSubdivision,
      unit.matriculeBuilding,
      unit.matriculeUnit,
      unit.matriculeZone,
      unit.matriculeDiscriminant,
      unit.predominantUseCode,
      unit.fileNumber,
      unit.neighborhoodUnit,
      unit.registrationConditionCode,
      unit.lotFrontageM,
      unit.lotAreaSqm,
      unit.agriculturalZoneCode,
      unit.buildingFloors,
      unit.constructionYear,
      unit.constructionYearType,
      unit.buildingFloorAreaSqm,
      unit.constructionTypeCode,
      unit.physicalLinkCode,
      unit.dwellingUnitsCount,
      unit.rentalRoomsCount,
      unit.nonResidentialUnitsCount,
      unit.marketReferenceDate,
      unit.landValue,
      unit.buildingValue,
      unit.totalPropertyValue,
      unit.previousRollValue,
      unit.servicedVacantLandCode,
      unit.nonResidentialClassCode,
      unit.industrialClassCode,
      runId,
    ]
  );

  const unitId = Number(unitRes.rows[0].id);

  // Replace 1:N child rows idempotently within the same transaction
  await client.query(`DELETE FROM assessment_addresses WHERE assessment_unit_id = $1`, [
    unitId,
  ]);
  for (const addr of unit.addresses) {
    await client.query(
      `INSERT INTO assessment_addresses (
        assessment_unit_id, address_index, street_number, street_number_suffix,
        street_number_high, street_type, street_direction, street_name,
        apartment_number, formatted_address
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
      [
        unitId,
        addr.addressIndex,
        addr.streetNumber,
        addr.streetNumberSuffix,
        addr.streetNumberHigh,
        addr.streetType,
        addr.streetDirection,
        addr.streetName,
        addr.apartmentNumber,
        addr.formattedAddress,
      ]
    );
  }

  await client.query(
    `DELETE FROM assessment_owner_statuses WHERE assessment_unit_id = $1`,
    [unitId]
  );
  for (const owner of unit.ownerStatuses) {
    await client.query(
      `INSERT INTO assessment_owner_statuses (
        assessment_unit_id, owner_index, registration_date, school_tax_status_code
      ) VALUES ($1, $2, $3, $4)`,
      [unitId, owner.ownerIndex, owner.registrationDate, owner.schoolTaxStatusCode]
    );
  }

  await client.query(
    `DELETE FROM assessment_tax_distributions WHERE assessment_unit_id = $1`,
    [unitId]
  );
  for (const dist of unit.taxDistributions) {
    await client.query(
      `INSERT INTO assessment_tax_distributions (
        assessment_unit_id, distribution_type, distribution_index,
        tax_category_code, taxable_value, non_taxable_value, legal_reference_code
      ) VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [
        unitId,
        dist.distributionType,
        dist.distributionIndex,
        dist.taxCategoryCode,
        dist.taxableValue,
        dist.nonTaxableValue,
        dist.legalReferenceCode,
      ]
    );
  }
}

export async function upsertUnitsBatch(
  pool: Pool,
  runId: number,
  items: Array<{ recordIndex: number; unit: AssessmentUnitInput }>
): Promise<{ loaded: number; rejected: RejectedRecordInput[] }> {
  if (items.length === 0) {
    return { loaded: 0, rejected: [] };
  }

  const client = await pool.connect();
  let loaded = 0;
  const rejected: RejectedRecordInput[] = [];

  try {
    await client.query("BEGIN");

    for (const item of items) {
      await client.query("SAVEPOINT unit_sp");
      try {
        await upsertSingleUnit(client, runId, item.unit);
        await client.query("RELEASE SAVEPOINT unit_sp");
        loaded += 1;
      } catch (err) {
        await client.query("ROLLBACK TO SAVEPOINT unit_sp");
        const message = err instanceof Error ? err.message : String(err);
        rejected.push({
          recordIndex: item.recordIndex,
          naturalKey: item.unit.naturalKey,
          errorStage: "load",
          errorMessage: message,
          rawPayload: item.unit,
        });
      }
    }

    await client.query("COMMIT");
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }

  return { loaded, rejected };
}

export async function insertRejectedRecords(
  pool: Pool,
  runId: number,
  rejected: RejectedRecordInput[]
): Promise<void> {
  for (const rec of rejected) {
    await pool.query(
      `INSERT INTO etl_rejected_records (
        run_id, record_index, natural_key, error_stage, error_message, raw_payload
      ) VALUES ($1, $2, $3, $4, $5, $6::jsonb)`,
      [
        runId,
        rec.recordIndex,
        rec.naturalKey,
        rec.errorStage,
        rec.errorMessage,
        JSON.stringify(rec.rawPayload ?? null),
      ]
    );
  }
}

export async function finalizeIngestionRun(
  pool: Pool,
  runId: number,
  params: {
    status: "completed" | "completed_with_errors" | "failed";
    recordsRead: number;
    recordsLoaded: number;
    recordsRejected: number;
    errorSummary?: string;
  }
): Promise<void> {
  await pool.query(
    `UPDATE etl_ingestion_runs
     SET status = $1,
         records_read = $2,
         records_loaded = $3,
         records_rejected = $4,
         error_summary = $5,
         finished_at = NOW()
     WHERE id = $6`,
    [
      params.status,
      params.recordsRead,
      params.recordsLoaded,
      params.recordsRejected,
      params.errorSummary ?? null,
      runId,
    ]
  );
}