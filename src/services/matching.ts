export function patternMatches(pattern: string, candidate: string): boolean {
  if (pattern === "*") {
    return true;
  }
  if (pattern.endsWith("*")) {
    return candidate.startsWith(pattern.slice(0, -1));
  }
  return pattern === candidate;
}

export function anyPatternMatches(patterns: string[], candidate: string): boolean {
  if (patterns.length === 0) {
    return false;
  }
  return patterns.some((pattern) => patternMatches(pattern, candidate));
}
