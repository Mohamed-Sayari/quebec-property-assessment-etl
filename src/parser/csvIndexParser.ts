import fs from "node:fs";
import readline from "node:readline";
import { MunicipalityIndexEntry } from "../types/assessment";

function parseCsvLine(line: string): string[] {
  const fields: string[] = [];
  let current = "";
  let inQuotes = false;

  for (let i = 0; i < line.length; i += 1) {
    const char = line[i];
    if (char === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i += 1;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (char === "," && !inQuotes) {
      fields.push(current.trim());
      current = "";
    } else {
      current += char;
    }
  }
  fields.push(current.trim());
  return fields;
}

export async function parseMunicipalityIndexCsv(
  csvPath: string
): Promise<Map<string, MunicipalityIndexEntry>> {
  const map = new Map<string, MunicipalityIndexEntry>();
  if (!fs.existsSync(csvPath)) {
    return map;
  }

  const stream = fs.createReadStream(csvPath, { encoding: "utf8" });
  const rl = readline.createInterface({ input: stream, crlfDelay: Infinity });

  let isHeader = true;
  for await (const rawLine of rl) {
    const line = rawLine.replace(/^\uFEFF/, "").trim();
    if (!line) continue;

    if (isHeader) {
      isHeader = false;
      continue;
    }

    const [rawCode, territoryName, sourceUrl, modifiedRaw] =
      parseCsvLine(line);

    if (!rawCode) continue;
    const municipalityCode = rawCode.padStart(5, "0");

    const parsedDate = modifiedRaw ? new Date(modifiedRaw.replace(" ", "T")) : null;
    const sourceModifiedAt =
      parsedDate && !Number.isNaN(parsedDate.getTime()) ? parsedDate : null;

    map.set(municipalityCode, {
      municipalityCode,
      territoryName: territoryName || municipalityCode,
      sourceUrl: sourceUrl || "",
      sourceModifiedAt,
    });
  }

  return map;
}