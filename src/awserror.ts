export function getErrorCode(err: unknown): string | undefined {
  if (isObject(err)) {
    if (typeof err.Code === "string") return err.Code;
    if (typeof err.__type === "string") return err.__type;
  }
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value != null;
}
