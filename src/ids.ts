export function normalizeIdentifier(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]/giu, "-");
}

export function hasAlphaNumeric(value: string): boolean {
  return /[a-z0-9]/iu.test(value);
}

export function buildButtonIdentitySeed(id: string): string {
  return normalizeIdentifier(id);
}

export function buildSwitchIdentitySeed(id: string): string {
  return `switch:${normalizeIdentifier(id)}`;
}

export function toRouteKey(id: string): string {
  return normalizeIdentifier(id);
}

export function toQualifiedPlatformAlias(value: unknown): string | undefined {
  if (typeof value !== "string") {
    return undefined;
  }

  return value.includes(".") ? value.split(".").at(-1) : value;
}
