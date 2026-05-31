const VERSION = "v1";
const IV_LENGTH_BYTES = 12;

export async function encryptLinodeToken(token: string, secret: string): Promise<string> {
  const iv = crypto.getRandomValues(new Uint8Array(IV_LENGTH_BYTES));
  const key = await importAesKey(secret);
  const ciphertext = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, new TextEncoder().encode(token));
  return `${VERSION}:${toBase64(iv)}:${toBase64(new Uint8Array(ciphertext))}`;
}

export async function decryptLinodeToken(encrypted: string, secret: string): Promise<string> {
  const [version, ivBase64, ciphertextBase64] = encrypted.split(":");
  if (version !== VERSION || !ivBase64 || !ciphertextBase64) throw new Error("Invalid encrypted token format");
  const key = await importAesKey(secret);
  const plaintext = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: fromBase64(ivBase64) },
    key,
    fromBase64(ciphertextBase64)
  );
  return new TextDecoder().decode(plaintext);
}

async function importAesKey(secret: string): Promise<CryptoKey> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(secret));
  return crypto.subtle.importKey("raw", digest, { name: "AES-GCM" }, false, ["encrypt", "decrypt"]);
}

function toBase64(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

function fromBase64(value: string): Uint8Array {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return bytes;
}
