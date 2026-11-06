import { expect, test } from "vitest";
import { matchPatterns } from "./matchPatterns.js";

test("matches strings exactly", () => {
  expect(matchPatterns("prod", ["dev", "prod"])).toBe("prod");
  expect(matchPatterns("production", ["prod"])).toBeUndefined();
});

test("returns the regex match", () => {
  expect(matchPatterns("app-pr-42", [/pr-\d+/])).toBe("pr-42");
  expect(matchPatterns("app-dev", [/pr-\d+/])).toBeUndefined();
});

test("returns the requested capture group", () => {
  expect(matchPatterns("app-pr-42", [/pr-(\d+)/], 1)).toBe("42");
});

test("checks patterns after a regex that does not match", () => {
  expect(matchPatterns("staging", [/^prod/, "staging"])).toBe("staging");
  expect(matchPatterns("app-pr-42", [/^prod/, /pr-(\d+)/], 1)).toBe("42");
});

test("returns undefined for null or undefined input", () => {
  expect(matchPatterns(null, ["x", /x/])).toBeUndefined();
  expect(matchPatterns(undefined, ["x", /x/])).toBeUndefined();
});

test("returns undefined for no patterns", () => {
  expect(matchPatterns("x", [])).toBeUndefined();
});
