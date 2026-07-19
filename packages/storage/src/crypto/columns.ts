import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

const algorithm = "aes-256-gcm";

export class ColumnCipher {
  readonly #key: Buffer;

  constructor(key: Uint8Array) {
    if (key.byteLength !== 32) throw new Error("COLUMN_KEY_LENGTH_INVALID");
    this.#key = Buffer.from(key);
  }

  encrypt(value: string | undefined): string | null {
    if (value === undefined || value.length === 0) return null;
    const iv = randomBytes(12);
    const cipher = createCipheriv(algorithm, this.#key, iv);
    const ciphertext = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
    const tag = cipher.getAuthTag();
    return ["v1", iv.toString("base64"), tag.toString("base64"), ciphertext.toString("base64")].join(":");
  }

  decrypt(value: string | null): string | undefined {
    if (value === null) return undefined;
    const [version, ivText, tagText, ciphertextText] = value.split(":");
    if (version !== "v1" || ivText === undefined || tagText === undefined || ciphertextText === undefined) {
      throw new Error("COLUMN_CIPHERTEXT_INVALID");
    }
    const decipher = createDecipheriv(algorithm, this.#key, Buffer.from(ivText, "base64"));
    decipher.setAuthTag(Buffer.from(tagText, "base64"));
    return Buffer.concat([
      decipher.update(Buffer.from(ciphertextText, "base64")),
      decipher.final(),
    ]).toString("utf8");
  }
}
