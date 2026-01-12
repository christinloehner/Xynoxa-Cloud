/*
 * Copyright (C) 2025 Christin Löhner
 */

export function b64encode(data: ArrayBuffer | Uint8Array) {
  const bytes = data instanceof Uint8Array ? data : new Uint8Array(data);
  let binary = "";
  for (let i = 0; i < bytes.byteLength; i++) binary += String.fromCharCode(bytes[i]);
  return btoa(binary);
}

export function b64decode(str: string) {
  const binary = atob(str);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

export async function deriveVaultKey(passphrase: string, salt: Uint8Array | ArrayBufferLike) {
  const enc = new TextEncoder();
  const saltBytes = salt instanceof Uint8Array ? salt : new Uint8Array(salt);
  const saltBuf = saltBytes.buffer.slice(0) as ArrayBuffer;
  const keyMaterial = await crypto.subtle.importKey("raw", enc.encode(passphrase), "PBKDF2", false, [
    "deriveKey"
  ]);
  return crypto.subtle.deriveKey(
    { name: "PBKDF2", salt: saltBuf, iterations: 100_000, hash: "SHA-256" },
    keyMaterial,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"]
  );
}

export async function encryptText(text: string, key: CryptoKey) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const enc = new TextEncoder();
  const cipher = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, enc.encode(text));
  return { cipher: b64encode(cipher), iv: b64encode(iv) };
}

export async function decryptText(cipher: string, iv: string, key: CryptoKey) {
  const dec = new TextDecoder();
  const plain = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: b64decode(iv) },
    key,
    b64decode(cipher)
  );
  return dec.decode(plain);
}

export async function encryptBytes(buffer: ArrayBuffer, key: CryptoKey) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const cipher = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, buffer);
  return { cipher: new Uint8Array(cipher), iv: b64encode(iv) };
}

export async function decryptBytes(cipher: ArrayBuffer | Uint8Array, iv: string, key: CryptoKey) {
  const data = cipher instanceof Uint8Array ? cipher : new Uint8Array(cipher);
  const buf = data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength) as ArrayBuffer;
  const plain = await crypto.subtle.decrypt({ name: "AES-GCM", iv: b64decode(iv) }, key, buf);
  return new Uint8Array(plain);
}

export function generateEnvelopeKey() {
  return crypto.getRandomValues(new Uint8Array(32));
}

export async function importEnvelopeKey(raw: Uint8Array) {
  const copy = new Uint8Array(raw.byteLength);
  copy.set(raw);
  const buf = copy.buffer;
  return crypto.subtle.importKey("raw", buf, { name: "AES-GCM" }, false, ["encrypt", "decrypt"]);
}

export async function wrapEnvelopeKey(rawKey: Uint8Array, derivedKey: CryptoKey) {
  const copy = new Uint8Array(rawKey.byteLength);
  copy.set(rawKey);
  const { cipher, iv } = await encryptBytes(copy.buffer, derivedKey);
  return { cipher: b64encode(cipher), iv };
}

export async function unwrapEnvelopeKey(ciphertext: string, iv: string, derivedKey: CryptoKey) {
  const raw = await decryptBytes(b64decode(ciphertext), iv, derivedKey);
  return new Uint8Array(raw);
}
