export function matchPatterns(
  s: string | null | undefined,
  patterns: (string | RegExp)[],
  group = 0,
): string | undefined {
  let result: string | undefined;
  if (s != null) {
    for (const pattern of patterns) {
      if (pattern instanceof RegExp) {
        const match = pattern.exec(s);
        result = match?.[group];
        break;
      }
      if (pattern === s) {
        result = s;
        break;
      }
    }
  }
  return result;
}
