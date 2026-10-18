import crypto from "node:crypto";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const RAW_KEY = process.env.ENCRYPTION_KEY || "fleetops-default-dev-key-change-in-production";
const MASTER_KEY = crypto.createHash("sha256").update(RAW_KEY).digest();

export function encryptSecret(plaintext: string): string {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", MASTER_KEY, iv);
  const enc = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `v1:${iv.toString("hex")}:${tag.toString("hex")}:${enc.toString("hex")}`;
}

export function decryptSecret(ciphertext: string): string {
  if (!ciphertext || !ciphertext.startsWith("v1:")) return ciphertext;
  const parts = ciphertext.split(":");
  if (parts.length !== 4) throw new Error("Invalid encrypted secret format");
  const iv = Buffer.from(parts[1], "hex");
  const tag = Buffer.from(parts[2], "hex");
  const data = Buffer.from(parts[3], "hex");
  const decipher = crypto.createDecipheriv("aes-256-gcm", MASTER_KEY, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(data), decipher.final()]).toString("utf8");
}

export function hashPassword(password: string): string {
  const salt = crypto.randomBytes(16).toString("hex");
  const hash = crypto.scryptSync(password, salt, 64).toString("hex");
  return `${salt}:${hash}`;
}

export function verifyPassword(password: string, stored: string): boolean {
  const [salt, key] = stored.split(":");
  if (!salt || !key) return false;
  const hashBuffer = crypto.scryptSync(password, salt, 64);
  const keyBuffer = Buffer.from(key, "hex");
  return keyBuffer.length === hashBuffer.length && crypto.timingSafeEqual(hashBuffer, keyBuffer);
}

export function generateSSHKeyPair(
  name: string,
  keyType: "ed25519" | "rsa" = "ed25519"
): { publicKey: string; privateKey: string; fingerprint: string } {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "fleetops-keygen-"));
  const keyPath = path.join(tmpDir, "id_key");
  try {
    const args =
      keyType === "ed25519"
        ? ["-t", "ed25519", "-C", name, "-f", keyPath, "-N", ""]
        : ["-t", "rsa", "-b", "4096", "-C", name, "-f", keyPath, "-N", ""];
    execFileSync("ssh-keygen", args, { stdio: "ignore" });
    const privateKey = fs.readFileSync(keyPath, "utf8");
    const publicKey = fs.readFileSync(`${keyPath}.pub`, "utf8").trim();
    const fpOut = execFileSync("ssh-keygen", ["-lf", `${keyPath}.pub`], { encoding: "utf8" });
    const fingerprint = fpOut.split(/\s+/)[1] || "SHA256:unknown";
    return { publicKey, privateKey, fingerprint };
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
}

export function computePublicKeyFingerprint(publicKey: string): string {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "fleetops-fp-"));
  const pubPath = path.join(tmpDir, "key.pub");
  try {
    fs.writeFileSync(pubPath, publicKey.trim() + "\n", "utf8");
    const fpOut = execFileSync("ssh-keygen", ["-lf", pubPath], { encoding: "utf8" });
    return fpOut.split(/\s+/)[1] || "SHA256:unknown";
  } catch {
    return "SHA256:" + crypto.createHash("sha256").update(publicKey.trim()).digest("base64").replace(/=+$/, "");
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
}

export function generateKeystoreMaterial(algorithm: "EC-P256" | "RSA-2048" | "AES-256" | "HMAC-SHA256"): {
  publicMaterial: string | null;
  privateMaterialEncrypted: string;
} {
  if (algorithm === "EC-P256") {
    const { publicKey, privateKey } = crypto.generateKeyPairSync("ec", {
      namedCurve: "prime256v1",
      publicKeyEncoding: { type: "spki", format: "pem" },
      privateKeyEncoding: { type: "pkcs8", format: "pem" },
    });
    return { publicMaterial: publicKey, privateMaterialEncrypted: encryptSecret(privateKey) };
  }
  if (algorithm === "RSA-2048") {
    const { publicKey, privateKey } = crypto.generateKeyPairSync("rsa", {
      modulusLength: 2048,
      publicKeyEncoding: { type: "spki", format: "pem" },
      privateKeyEncoding: { type: "pkcs8", format: "pem" },
    });
    return { publicMaterial: publicKey, privateMaterialEncrypted: encryptSecret(privateKey) };
  }
  const rawHex = crypto.randomBytes(32).toString("hex");
  return { publicMaterial: null, privateMaterialEncrypted: encryptSecret(rawHex) };
}

export function keystoreOperation(
  algorithm: string,
  privateMaterialEncrypted: string,
  operation: "sign" | "encrypt" | "decrypt",
  payloadText: string
): string {
  const secret = decryptSecret(privateMaterialEncrypted);
  if (operation === "sign") {
    if (algorithm === "HMAC-SHA256" || algorithm === "AES-256") {
      return crypto.createHmac("sha256", Buffer.from(secret, "hex")).update(payloadText, "utf8").digest("base64");
    }
    const signer = crypto.createSign("SHA256");
    signer.update(payloadText, "utf8");
    signer.end();
    return signer.sign(secret, "base64");
  }
  if (operation === "encrypt") {
    const keyBuf =
      algorithm === "AES-256" || algorithm === "HMAC-SHA256"
        ? Buffer.from(secret, "hex")
        : crypto.createHash("sha256").update(secret).digest();
    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv("aes-256-gcm", keyBuf, iv);
    const enc = Buffer.concat([cipher.update(payloadText, "utf8"), cipher.final()]);
    const tag = cipher.getAuthTag();
    return `${iv.toString("base64")}.${tag.toString("base64")}.${enc.toString("base64")}`;
  }
  if (operation === "decrypt") {
    const keyBuf =
      algorithm === "AES-256" || algorithm === "HMAC-SHA256"
        ? Buffer.from(secret, "hex")
        : crypto.createHash("sha256").update(secret).digest();
    const [ivB64, tagB64, dataB64] = payloadText.split(".");
    const decipher = crypto.createDecipheriv("aes-256-gcm", keyBuf, Buffer.from(ivB64, "base64"));
    decipher.setAuthTag(Buffer.from(tagB64, "base64"));
    return Buffer.concat([decipher.update(Buffer.from(dataB64, "base64")), decipher.final()]).toString("utf8");
  }
  throw new Error(`Unsupported keystore operation: ${operation}`);
}
