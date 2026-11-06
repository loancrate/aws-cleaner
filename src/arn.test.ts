import { expect, test } from "vitest";
import { makeArn, makeTaskDefFamilyArnFields, parseArn } from "./arn.js";

const base = { partition: "aws", region: "us-east-1", accountId: "123456789012" };

test.each([
  ["arn:aws:sns:us-east-1:123456789012:topic", { service: "sns", resourceId: "topic" }],
  ["arn:aws:ec2:us-east-1:123456789012:vpc/vpc-1", { service: "ec2", resourceType: "vpc", resourceId: "vpc-1" }],
  [
    "arn:aws:logs:us-east-1:123456789012:log-group:/ecs/app:*",
    { service: "logs", resourceType: "log-group", resourceId: "/ecs/app:*" },
  ],
  [
    "arn:aws:elasticloadbalancing:us-east-1:123456789012:targetgroup/tg/abc",
    { service: "elasticloadbalancing", resourceType: "targetgroup", resourceId: "tg/abc" },
  ],
])("parses %s", (arn, fields) => {
  expect(parseArn(arn)).toEqual({ ...base, resourceType: undefined, ...fields });
});

test("parses ARNs with empty region and account", () => {
  expect(parseArn("arn:aws:s3:::bucket")).toEqual({
    partition: "aws",
    service: "s3",
    region: "",
    accountId: "",
    resourceId: "bucket",
    resourceType: undefined,
  });
});

test("rejects malformed ARNs", () => {
  expect(() => parseArn("not-an-arn")).toThrow("Invalid ARN: not-an-arn");
  expect(() => parseArn("arn:aws:sns")).toThrow();
});

test("makeArn round-trips colon-delimited ARNs", () => {
  for (const arn of ["arn:aws:sns:us-east-1:123456789012:topic", "arn:aws:rds:us-east-1:123456789012:db:mydb"]) {
    expect(makeArn(parseArn(arn))).toBe(arn);
  }
});

test("makeArn uses the given resource type delimiter", () => {
  const fields = parseArn("arn:aws:ec2:us-east-1:123456789012:vpc/vpc-1");
  expect(makeArn(fields)).toBe("arn:aws:ec2:us-east-1:123456789012:vpc:vpc-1");
  expect(makeArn(fields, "/")).toBe("arn:aws:ec2:us-east-1:123456789012:vpc/vpc-1");
});

test("makeTaskDefFamilyArnFields builds a synthetic ECS ARN", () => {
  expect(makeArn(makeTaskDefFamilyArnFields("123456789012", "app"))).toBe(
    "arn:aws:ecs::123456789012:task-definition-family:app",
  );
});
