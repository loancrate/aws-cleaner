import { expect, test } from "vitest";
import { hasErrorCode } from "./awserror.js";

test("matches err.Code", () => {
  expect(hasErrorCode({ Code: "NoSuchBucket" }, "NoSuchBucket")).toBe(true);
  expect(hasErrorCode({ Code: "NoSuchBucket" }, "OtherError")).toBe(false);
});

test("matches err.__type", () => {
  expect(hasErrorCode({ __type: "ThrottlingException" }, "ThrottlingException")).toBe(true);
  expect(hasErrorCode({ __type: "ThrottlingException" }, "OtherError")).toBe(false);
});

test("does not match fully-qualified err.__type", () => {
  expect(
    hasErrorCode(
      { __type: "com.amazonaws.dynamodb.v20120810#ResourceNotFoundException" },
      "ResourceNotFoundException",
    ),
  ).toBe(false);
});

test("matches err.Error.Code (RDS style)", () => {
  expect(hasErrorCode({ Error: { Code: "DBClusterNotFoundFault" } }, "DBClusterNotFoundFault")).toBe(true);
  expect(hasErrorCode({ Error: { Code: "DBClusterNotFoundFault" } }, "OtherError")).toBe(false);
});

test("matches err.name", () => {
  const err = new Error("test");
  err.name = "ResourceNotFoundException";
  expect(hasErrorCode(err, "ResourceNotFoundException")).toBe(true);
  expect(hasErrorCode(err, "OtherError")).toBe(false);
});

test("accepts array of codes", () => {
  expect(hasErrorCode({ Code: "A" }, ["A", "B"])).toBe(true);
  expect(hasErrorCode({ Code: "B" }, ["A", "B"])).toBe(true);
  expect(hasErrorCode({ Code: "C" }, ["A", "B"])).toBe(false);
});

test("returns false for non-object inputs", () => {
  expect(hasErrorCode(null, "X")).toBe(false);
  expect(hasErrorCode(undefined, "X")).toBe(false);
  expect(hasErrorCode("string", "X")).toBe(false);
  expect(hasErrorCode(42, "X")).toBe(false);
});

test("matches name even when __type is fully-qualified", () => {
  const err = {
    __type: "com.amazonaws.dynamodb.v20120810#ResourceNotFoundException",
    name: "ResourceNotFoundException",
  };
  expect(hasErrorCode(err, "ResourceNotFoundException")).toBe(true);
});
