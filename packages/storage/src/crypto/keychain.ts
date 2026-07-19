import { execFileSync } from "node:child_process";
import { randomBytes } from "node:crypto";

const defaultService = "cn.xinxisuyang.competition-console";
const defaultAccount = "sqlite-column-key";

export function getOrCreateKeychainKey(
  service = defaultService,
  account = defaultAccount,
): Buffer {
  try {
    const existing = execFileSync(
      "security",
      ["find-generic-password", "-s", service, "-a", account, "-w"],
      { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] },
    ).trim();
    const decoded = Buffer.from(existing, "base64");
    if (decoded.byteLength !== 32) throw new Error("KEYCHAIN_KEY_LENGTH_INVALID");
    return decoded;
  } catch (error) {
    if (error instanceof Error && error.message === "KEYCHAIN_KEY_LENGTH_INVALID") throw error;
  }

  const generated = randomBytes(32);
  execFileSync(
    "security",
    [
      "add-generic-password",
      "-U",
      "-s",
      service,
      "-a",
      account,
      "-w",
      generated.toString("base64"),
    ],
    { stdio: ["ignore", "ignore", "pipe"] },
  );
  return generated;
}
