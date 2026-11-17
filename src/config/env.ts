import dotenv from "dotenv";

dotenv.config();

export interface AppConfig {
  databaseUrl: string;
  batchSize: number;
}

export function loadConfig(): AppConfig {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    throw new Error("Missing required environment variable: DATABASE_URL");
  }

  const rawBatchSize = Number(process.env.BATCH_SIZE ?? "250");
  const batchSize =
    Number.isInteger(rawBatchSize) && rawBatchSize > 0 ? rawBatchSize : 250;

  return {
    databaseUrl,
    batchSize,
  };
}