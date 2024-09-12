import { compare, compareNumericString, compareStringOrNumber } from "./compare.js";

test("compare", () => {
  expect(compare(1, 1)).toBe(0);
  expect(compare(1, 9)).toBeLessThan(0);
  expect(compare(9, 1)).toBeGreaterThan(0);

  expect(compare("aaa", "aaa")).toBe(0);
  expect(compare("aaa", "bbb")).toBeLessThan(0);
  expect(compare("bbb", "aaa")).toBeGreaterThan(0);
});

test("compareStringOrNumber", () => {
  expect(compareStringOrNumber(1, 1)).toBe(0);
  expect(compareStringOrNumber(1, 9)).toBeLessThan(0);
  expect(compareStringOrNumber(9, 1)).toBeGreaterThan(0);

  expect(compareStringOrNumber("aaa", "aaa")).toBe(0);
  expect(compareStringOrNumber("aaa", "bbb")).toBeLessThan(0);
  expect(compareStringOrNumber("bbb", "aaa")).toBeGreaterThan(0);

  expect(compareStringOrNumber(1, "aaa")).toBeLessThan(0);
  expect(compareStringOrNumber("aaa", 1)).toBeGreaterThan(0);
});

test("compareNumericString", () => {
  expect(compareNumericString("a-999", "a-999")).toBe(0);
  expect(compareNumericString("a-999", "a-1000")).toBeLessThan(0);
  expect(compareNumericString("a-1000", "a-999")).toBeGreaterThan(0);

  expect(compareNumericString("a-999", "b-999")).toBeLessThan(0);
  expect(compareNumericString("b-999", "a-999")).toBeGreaterThan(0);
  expect(compareNumericString("a-999", "a-1000")).toBeLessThan(0);
  expect(compareNumericString("b-999", "a-1000")).toBeGreaterThan(0);
  expect(compareNumericString("a-1000", "a-999")).toBeGreaterThan(0);
  expect(compareNumericString("a-1000", "b-999")).toBeLessThan(0);

  expect(compareNumericString("a-1-99", "a-1-99")).toBe(0);
  expect(compareNumericString("a-1-99", "a-1-100")).toBeLessThan(0);
  expect(compareNumericString("a-1-100", "a-1-99")).toBeGreaterThan(0);
});
