import fs from "node:fs";
import path from "node:path";
import { Pool } from "pg";
import { loadConfig } from "./config/env";
import {
  createIngestionRun,
  ensureMunicipalityAndUpdateRun,
  finalizeIngestionRun,
  findCompletedRunByChecksum,
  insertRejectedRecords,
  upsertUnitsBatch,
} from "./loader/assessmentLoader";
import { createDbPool } from "./loader/dbPool";
import { parseMunicipalityIndexCsv } from "./parser/csvIndexParser";
import { streamAssessmentXml } from "./parser/xmlStreamParser";
import { transformUnitNode } from "./transformer/assessmentTransformer";
import {
  AssessmentUnitInput,
  MunicipalityIndexEntry,
  RejectedRecordInput,
  RollHeader,
} from "./types/assessment";
import { computeFileSha256 } from "./utils/hash";
import { validateAssessmentUnit } from "./validator/assessmentValidator";

interface CliArgs {
  files: string[];
  dir: string | null;
  indexCsv: string | null;
  skipUnchanged: boolean;
}

function parseCliArgs(argv: string[]): CliArgs {
  const files: string[] = [];
  let dir: string | null = null;
  let indexCsv: string | null = null;
  let skipUnchanged = false;

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--file" && argv[i + 1]) {
      files.push(argv[i + 1]);
      i += 1;
    } else if (arg === "--dir" && argv[i + 1]) {
      dir = argv[i + 1];
      i += 1;
    } else if (arg === "--index" && argv[i + 1]) {
      indexCsv = argv[i + 1];
      i += 1;
    } else if (arg === "--skip-unchanged") {
      skipUnchanged = true;
    }
  }

  return { files, dir, indexCsv, skipUnchanged };
}

function resolveInputFiles(args: CliArgs): string[] {
  const resolved = [...args.files];

  if (args.dir) {
    const entries = fs.readdirSync(args.dir);
    for (const entry of entries) {
      if (entry.toLowerCase().endsWith(".xml")) {
        resolved.push(path.join(args.dir, entry));
      }
    }
  }

  if (resolved.length === 0) {
    throw new Error(
      "No XML files specified. Usage: npm run ingest -- --file data/sample/RM01042.xml (or --dir data/sample)"
    );
  }

  for (const file of resolved) {
    if (!fs.existsSync(file)) {
      throw new Error(`Input file not found: ${file}`);
    }
  }

  return resolved;
}

async function processSingleXmlFile(params: {
  pool: Pool;
  filePath: string;
  batchSize: number;
  skipUnchanged: boolean;
  municipalityIndex: Map<string, MunicipalityIndexEntry>;
}): Promise<void> {
  const { pool, filePath, batchSize, skipUnchanged, municipalityIndex } = params;
  const fileName = path.basename(filePath);
  const startTime = Date.now();

  const fileChecksum = await computeFileSha256(filePath);

  if (skipUnchanged) {
    const previousRunId = await findCompletedRunByChecksum(pool, fileChecksum);
    if (previousRunId !== null) {
      console.log(
        `[SKIP] ${fileName} already imported cleanly in run #${previousRunId} (checksum match).`
      );
      return;
    }
  }

  const runId = await createIngestionRun(pool, fileName, fileChecksum);
  console.log(`[START] Run #${runId} -> ${fileName}`);

  let currentHeader: RollHeader | null = null;
  let recordsRead = 0;
  let recordsLoaded = 0;
  let recordsRejected = 0;

  let batch: Array<{ recordIndex: number; unit: AssessmentUnitInput }> = [];
  let rejectedBuffer: RejectedRecordInput[] = [];

  const flushBatch = async () => {
    if (batch.length > 0) {
      const { loaded, rejected } = await upsertUnitsBatch(pool, runId, batch);
      recordsLoaded += loaded;
      recordsRejected += rejected.length;
      rejectedBuffer.push(...rejected);
      batch = [];
    }

    if (rejectedBuffer.length > 0) {
      await insertRejectedRecords(pool, runId, rejectedBuffer);
      rejectedBuffer = [];
    }
  };

  try {
    const streamResult = await streamAssessmentXml({
      filePath,
      onHeader: async (header) => {
        currentHeader = header;
        const indexEntry = municipalityIndex.get(header.municipalityCode);
        await ensureMunicipalityAndUpdateRun(pool, runId, header, indexEntry);
      },
      onUnit: async (unitNode, recordIndex) => {
        recordsRead += 1;
        if (!currentHeader) {
          throw new Error("Encountered <RLUEx> before roll header metadata");
        }

        let transformed: unknown;
        try {
          transformed = transformUnitNode(unitNode, currentHeader);
        } catch (err) {
          recordsRejected += 1;
          rejectedBuffer.push({
            recordIndex,
            naturalKey: null,
            errorStage: "transform",
            errorMessage: err instanceof Error ? err.message : String(err),
            rawPayload: { tag: unitNode.name },
          });
          return;
        }

        const validation = validateAssessmentUnit(transformed);
        if (!validation.success) {
          recordsRejected += 1;
          const maybeKey =
            typeof transformed === "object" &&
            transformed !== null &&
            "naturalKey" in transformed
              ? String((transformed as { naturalKey?: unknown }).naturalKey ?? "")
              : null;

          rejectedBuffer.push({
            recordIndex,
            naturalKey: maybeKey || null,
            errorStage: "validate",
            errorMessage: validation.errorMessage,
            rawPayload: transformed,
          });
          return;
        }

        batch.push({ recordIndex, unit: validation.data });
        if (batch.length >= batchSize || rejectedBuffer.length >= batchSize) {
          await flushBatch();
        }
      },
    });

    await flushBatch();

    const finalStatus =
      recordsRejected > 0 ? "completed_with_errors" : "completed";
    await finalizeIngestionRun(pool, runId, {
      status: finalStatus,
      recordsRead: streamResult.totalRead,
      recordsLoaded,
      recordsRejected,
    });

    const elapsedMs = Date.now() - startTime;
    console.log(
      `[DONE] Run #${runId} (${fileName}) | status=${finalStatus} | read=${recordsRead} | loaded=${recordsLoaded} | rejected=${recordsRejected} | time=${elapsedMs}ms`
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await finalizeIngestionRun(pool, runId, {
      status: "failed",
      recordsRead,
      recordsLoaded,
      recordsRejected,
      errorSummary: message,
    });
    throw err;
  }
}

async function main(): Promise<void> {
  const config = loadConfig();
  const args = parseCliArgs(process.argv.slice(2));
  const inputFiles = resolveInputFiles(args);

  const defaultIndexPath = path.join("data", "sample", "indexRole2026.csv");
  const indexCsvPath =
    args.indexCsv ?? (fs.existsSync(defaultIndexPath) ? defaultIndexPath : null);

  const municipalityIndex = indexCsvPath
    ? await parseMunicipalityIndexCsv(indexCsvPath)
    : new Map<string, MunicipalityIndexEntry>();

  if (indexCsvPath) {
    console.log(
      `[INFO] Loaded ${municipalityIndex.size} municipalities from ${indexCsvPath}`
    );
  }

  const pool = createDbPool(config.databaseUrl);
  try {
    for (const filePath of inputFiles) {
      await processSingleXmlFile({
        pool,
        filePath,
        batchSize: config.batchSize,
        skipUnchanged: args.skipUnchanged,
        municipalityIndex,
      });
    }
  } finally {
    await pool.end();
  }
}

main().catch((err) => {
  console.error("[FATAL]", err);
  process.exit(1);
});