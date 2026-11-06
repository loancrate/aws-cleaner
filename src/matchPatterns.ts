export function matchPatterns(
  s: string | null | undefined,
  patterns: (string | RegExp)[],
  group = 0,
): string | undefined {
  if (s != null) {
    for (const pattern of patterns) {
      if (pattern instanceof RegExp) {
        const match = pattern.exec(s);
        if (match) {
          return match[group];
        }
      } else if (pattern === s) {
        return s;
      }
    }
  }
  return undefined;
}
