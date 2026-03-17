import type { IncomingMessage } from "node:http";
import { BUTTON_EVENT_ALIASES } from "./settings";
import type { ButtonEvent, ParsedRoute } from "./types";

const MAX_BODY_BYTES = 64 * 1024;

export class RequestBodyParseError extends Error {}

export function parseRoute(pathname: string): ParsedRoute {
  const cleanPath = normalizePathname(pathname);

  if (cleanPath === "/health") {
    return { kind: "health" };
  }

  if (cleanPath.startsWith("/buttons/")) {
    const parts = cleanPath.split("/").filter(Boolean);
    if (parts.length === 2 && parts[1] != null) {
      return { kind: "button", id: decodeURIComponent(parts[1]) };
    }
  }

  if (cleanPath.startsWith("/button-")) {
    const legacyId = decodeURIComponent(cleanPath.slice("/button-".length));
    if (legacyId.length > 0 && !legacyId.includes("/")) {
      return { kind: "legacy-button", id: legacyId };
    }
  }

  if (cleanPath.startsWith("/switches/")) {
    const parts = cleanPath.split("/").filter(Boolean);

    if (parts.length === 2 && parts[1] != null) {
      return { kind: "switch-state", id: decodeURIComponent(parts[1]) };
    }

    if (parts.length === 3 && parts[1] != null && parts[2] != null) {
      const action = parts[2];
      if (action === "on" || action === "off" || action === "toggle" || action === "set") {
        return {
          kind: "switch-action",
          id: decodeURIComponent(parts[1]),
          action,
        };
      }
    }
  }

  return { kind: "not-found" };
}

export function normalizeButtonEvent(value: unknown): ButtonEvent | undefined {
  if (typeof value !== "string") {
    return undefined;
  }

  const normalized = value.trim().toLowerCase();
  return BUTTON_EVENT_ALIASES[normalized as keyof typeof BUTTON_EVENT_ALIASES];
}

export function coerceBoolean(value: unknown): boolean | undefined {
  if (typeof value === "boolean") {
    return value;
  }

  if (typeof value === "number") {
    if (value === 1) {
      return true;
    }

    if (value === 0) {
      return false;
    }

    return undefined;
  }

  if (typeof value !== "string") {
    return undefined;
  }

  const normalized = value.trim().toLowerCase();
  if (["true", "1", "on", "yes"].includes(normalized)) {
    return true;
  }

  if (["false", "0", "off", "no"].includes(normalized)) {
    return false;
  }

  return undefined;
}

export function extractRequestToken(
  headers: IncomingMessage["headers"],
  query: URLSearchParams,
): string | undefined {
  const bearerToken = headers.authorization?.match(/^Bearer\s+(.+)$/i)?.[1]?.trim();
  if (bearerToken) {
    return bearerToken;
  }

  return query.get("token") ?? undefined;
}

export async function readRequestBody(req: IncomingMessage): Promise<Record<string, unknown>> {
  const chunks: Buffer[] = [];
  let bytesRead = 0;

  for await (const chunk of req) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    bytesRead += buffer.length;

    if (bytesRead > MAX_BODY_BYTES) {
      throw new RequestBodyParseError(`Request body exceeds ${MAX_BODY_BYTES} bytes.`);
    }

    chunks.push(buffer);
  }

  if (chunks.length === 0) {
    return {};
  }

  const body = Buffer.concat(chunks).toString("utf8").trim();
  if (body.length === 0) {
    return {};
  }

  const contentType = req.headers["content-type"]?.split(";")[0]?.trim().toLowerCase();

  if (contentType === "application/json") {
    try {
      const parsed = JSON.parse(body) as unknown;
      if (isRecord(parsed)) {
        return parsed;
      }

      throw new RequestBodyParseError("JSON request body must be an object.");
    } catch (error) {
      if (error instanceof RequestBodyParseError) {
        throw error;
      }

      throw new RequestBodyParseError("Invalid JSON request body.");
    }
  }

  if (contentType === "application/x-www-form-urlencoded") {
    return Object.fromEntries(new URLSearchParams(body).entries());
  }

  return {};
}

function normalizePathname(pathname: string): string {
  if (pathname.length === 0 || pathname === "/") {
    return "/";
  }

  return pathname.replace(/\/+$/g, "") || "/";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value != null && !Array.isArray(value);
}
