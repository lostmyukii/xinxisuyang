import { randomBytes } from "node:crypto";
import { resolve } from "node:path";
import { buildServer } from "./app.js";
import { CompetitionRepository, getOrCreateKeychainKey } from "@xinxisuyang/storage";

const host = process.env.HOST ?? "127.0.0.1";
if (host !== "127.0.0.1") throw new Error("HOST_MUST_BE_LOOPBACK");
const port = Number(process.env.PORT ?? "4318");
if (!Number.isInteger(port) || port < 1024 || port > 65_535) throw new Error("PORT_INVALID");

const configuredDatabasePath = process.env.DATABASE_PATH ?? "./data/competition.sqlite";
const databasePath = configuredDatabasePath === ":memory:" ? ":memory:" : resolve(configuredDatabasePath);
const testKeyText = process.env.NODE_ENV === "test" ? process.env.COLUMN_KEY_BASE64 : undefined;
const encryptionKey = testKeyText === undefined ? getOrCreateKeychainKey() : Buffer.from(testKeyText, "base64");
if (encryptionKey.byteLength !== 32) throw new Error("COLUMN_KEY_LENGTH_INVALID");
const repository = new CompetitionRepository({
  path: databasePath,
  encryptionKey,
});
const configuredPairingToken = process.env.PAIRING_TOKEN?.trim();
const pairingToken = configuredPairingToken === undefined || configuredPairingToken.length === 0
  ? randomBytes(18).toString("base64url")
  : configuredPairingToken;
const webOrigins = process.env.WEB_ORIGIN?.split(",").map((value) => value.trim()).filter(Boolean);
const app = await buildServer({
  repository,
  pairingToken,
  ...(webOrigins === undefined ? {} : { webOrigins }),
});

const shutdown = async () => {
  await app.close();
  repository.close();
};
process.once("SIGINT", () => void shutdown());
process.once("SIGTERM", () => void shutdown());

await app.listen({ host, port });
console.log(`Chrome 扩展配对码：${pairingToken}`);
