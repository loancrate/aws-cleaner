import { asError } from "catch-unknown";

export function getErrorCode(err: unknown): string | undefined {
  if (isObject(err)) {
    if (typeof err.Code === "string") return err.Code;
    if (typeof err.__type === "string") return err.__type;
    // RDS client
    if (isObject(err.Error)) {
      if (typeof err.Error.Code === "string") return err.Error.Code;
    }
  }
}

export function getErrorMessage(err: unknown): string {
  // RDS client (err.message is "UnknownError")
  if (isObject(err) && isObject(err.Error) && typeof err.Error.Message === "string") {
    return err.Error.Message;
  }
  return asError(err).message;
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value != null;
}
