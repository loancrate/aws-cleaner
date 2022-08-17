export function isNotNull<T>(v: T | null | undefined): v is T {
  return v != null;
}

export function isObject(v: unknown): v is Record<string, unknown> {
  return v != null && typeof v === "object";
}
