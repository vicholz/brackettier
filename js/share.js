/** JSON export / import / URL hash sharing */

import { normalizeState, STATE_VERSION } from "./storage.js";

const HASH_PREFIX = "#bt=";
const MAX_SHARE_CHARS = 80_000;

export function stateToJson(state, pretty = true) {
  const payload = { ...state, version: STATE_VERSION };
  return pretty ? JSON.stringify(payload, null, 2) : JSON.stringify(payload);
}

export function parseStateJson(text) {
  const data = JSON.parse(text);
  return normalizeState(data);
}

export function downloadJson(state, filename = "brackettier.json") {
  const blob = new Blob([stateToJson(state)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export async function encodeSharePayload(state) {
  const json = stateToJson(state, false);
  const compressed = await compressString(json);
  return compressed;
}

export async function decodeSharePayload(encoded) {
  const json = await decompressString(encoded);
  return parseStateJson(json);
}

export async function buildShareUrl(state) {
  const encoded = await encodeSharePayload(state);
  const url = `${location.origin}${location.pathname}${location.search}${HASH_PREFIX}${encoded}`;
  return { url, encoded, tooLarge: url.length > MAX_SHARE_CHARS };
}

export async function tryLoadFromHash() {
  const hash = location.hash || "";
  if (!hash.startsWith(HASH_PREFIX)) return null;
  const encoded = hash.slice(HASH_PREFIX.length);
  if (!encoded) return null;
  try {
    return await decodeSharePayload(encoded);
  } catch (err) {
    console.warn("Failed to load share hash", err);
    return null;
  }
}

export function clearShareHash() {
  if (location.hash.startsWith(HASH_PREFIX)) {
    history.replaceState(null, "", `${location.pathname}${location.search}`);
  }
}

async function compressString(str) {
  if (typeof CompressionStream !== "undefined") {
    const bytes = new TextEncoder().encode(str);
    const stream = new Blob([bytes]).stream().pipeThrough(new CompressionStream("gzip"));
    const buf = await new Response(stream).arrayBuffer();
    return `g${bytesToBase64Url(new Uint8Array(buf))}`;
  }
  return `u${utf8ToBase64Url(str)}`;
}

async function decompressString(encoded) {
  const kind = encoded[0];
  const body = encoded.slice(1);
  if (kind === "g") {
    if (typeof DecompressionStream === "undefined") {
      throw new Error("Gzip share links need a modern browser");
    }
    const bytes = base64UrlToBytes(body);
    const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream("gzip"));
    return await new Response(stream).text();
  }
  if (kind === "u") {
    return base64UrlToUtf8(body);
  }
  // Legacy: raw base64url JSON
  return base64UrlToUtf8(encoded);
}

function bytesToBase64Url(bytes) {
  let binary = "";
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function base64UrlToBytes(str) {
  const padded = str.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((str.length + 3) % 4);
  const binary = atob(padded);
  const out = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) out[i] = binary.charCodeAt(i);
  return out;
}

function utf8ToBase64Url(str) {
  return bytesToBase64Url(new TextEncoder().encode(str));
}

function base64UrlToUtf8(str) {
  return new TextDecoder().decode(base64UrlToBytes(str));
}
