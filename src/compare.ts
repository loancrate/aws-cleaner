export function compare<T>(a: T, b: T): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

export function compareStringOrNumber(a: string | number, b: string | number): number {
  return typeof a === "number" && typeof b === "number" ? a - b : compare(String(a), String(b));
}

export function compareNumericString(a: string, b: string): number {
  for (;;) {
    const { number: aNumber, text: aText, rest: aRest } = getLeadingNumeric(a);
    const { number: bNumber, text: bText, rest: bRest } = getLeadingNumeric(b);
    const result = aNumber != null && bNumber != null ? aNumber - bNumber : compare(aText, bText);
    if (result !== 0 || (!aRest && !bRest)) return result;
    a = aRest;
    b = bRest;
  }
}

function getLeadingNumeric(s: string): { number?: number; text: string; rest: string } {
  const match = /^(\d*)(\D*)(.*)$/.exec(s);
  if (match) {
    const [, numberStr, text, rest] = match;
    if (numberStr) {
      return { number: parseInt(numberStr), text: numberStr, rest: text + rest };
    } else {
      return { text, rest };
    }
  }
  return { text: "", rest: "" };
}
