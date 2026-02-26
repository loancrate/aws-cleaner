import { asError } from "catch-unknown";
import { isObject } from "./typeUtil.js";

export function hasErrorCode(err: unknown, code: string | string[]): boolean {
  if (isObject(err)) {
    const codes = Array.isArray(code) ? code : [code];
    for (const c of codes) {
      if (typeof err.name === "string" && err.name === c) {
        return true;
      }
      if (typeof err.Code === "string" && err.Code === c) {
        return true;
      }
      if (typeof err.__type === "string" && err.__type === c) {
        return true;
      }
      if (isObject(err.Error) && typeof err.Error.Code === "string" && err.Error.Code === c) {
        return true;
      }
    }
  }
  return false;
}

export function getErrorMessage(err: unknown): string {
  // RDS client (err.message is "UnknownError")
  if (isObject(err) && isObject(err.Error) && typeof err.Error.Message === "string") {
    return err.Error.Message;
  }
  return asError(err).message;
}
