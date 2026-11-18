import type { MatchConfig } from "@/engine/types";

/**
 * Pure URL-safe Base64 UTF-8 Codec for serverless 100% zero-DB level sharing (?s=...)
 */

function bytesToBase64Url(bytes: Uint8Array): string {
  let binary = "";
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  const base64 =
    typeof btoa === "function"
      ? btoa(binary)
      : Buffer.from(bytes).toString("base64");
  return base64.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function base64UrlToBytes(encoded: string): Uint8Array {
  const base64 = encoded
    .replace(/-/g, "+")
    .replace(/_/g, "/")
    .padEnd(Math.ceil(encoded.length / 4) * 4, "=");

  if (typeof atob === "function") {
    const binary = atob(base64);
    const out = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
      out[i] = binary.charCodeAt(i);
    }
    return out;
  }
  return new Uint8Array(Buffer.from(base64, "base64"));
}

export function encodeMatchToUrlParam(config: MatchConfig): string {
  const json = JSON.stringify(config);
  const bytes = new TextEncoder().encode(json);
  return bytesToBase64Url(bytes);
}

export function decodeMatchFromUrlParam(param: string): MatchConfig | null {
  try {
    if (!param || param.length > 32_000) return null;
    const bytes = base64UrlToBytes(param.trim());
    const json = new TextDecoder().decode(bytes);
    const parsed = JSON.parse(json) as MatchConfig;
    if (
      !parsed ||
      typeof parsed !== "object" ||
      !Array.isArray(parsed.lanes) ||
      parsed.lanes.length < 2 ||
      parsed.lanes.length > 3 ||
      !parsed.rules
    ) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}
