import { ResourceNotFoundException } from "@aws-sdk/client-eventbridge";
import { beforeEach, expect, test, vi } from "vitest";
import { deleteEventBridgeRule } from "./eventbridge.js";

const send = vi.hoisted(() => vi.fn<(command: { input: unknown }) => Promise<unknown>>());

vi.mock("@aws-sdk/client-eventbridge", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@aws-sdk/client-eventbridge")>()),
  EventBridgeClient: class {
    send = send;
  },
}));

beforeEach(() => {
  send.mockReset();
});

test.each([0, 1, 2])("succeeds when the rule is missing at cleanup step %i", async (step) => {
  for (let i = 0; i < step; i++) {
    send.mockResolvedValueOnce({ Targets: [{ Id: "target" }] });
  }
  send.mockRejectedValueOnce(
    new ResourceNotFoundException({ message: "Rule does not exist on EventBus default.", $metadata: {} }),
  );

  await expect(deleteEventBridgeRule({ resourceId: "rule" })).resolves.toBeUndefined();
  expect(send).toHaveBeenCalledTimes(step + 1);
});

test.each([0, 1, 2])("propagates other errors at cleanup step %i", async (step) => {
  for (let i = 0; i < step; i++) {
    send.mockResolvedValueOnce({ Targets: [{ Id: "target" }] });
  }
  const error = new Error("Access denied");
  send.mockRejectedValueOnce(error);

  await expect(deleteEventBridgeRule({ resourceId: "rule" })).rejects.toBe(error);
  expect(send).toHaveBeenCalledTimes(step + 1);
});

test("removes targets before deleting the rule", async () => {
  send.mockResolvedValue({});
  send.mockResolvedValueOnce({ Targets: [{ Id: "target" }] });

  await deleteEventBridgeRule({ resourceId: "rule" });

  expect(send.mock.calls.map(([command]) => [command.constructor.name, command.input])).toEqual([
    ["ListTargetsByRuleCommand", { Rule: "rule" }],
    ["RemoveTargetsCommand", { Rule: "rule", Ids: ["target"] }],
    ["DeleteRuleCommand", { Name: "rule" }],
  ]);
});

test("deletes a rule with no targets without calling RemoveTargets", async () => {
  send.mockResolvedValue({});

  await deleteEventBridgeRule({ resourceId: "rule" });

  expect(send.mock.calls.map(([command]) => command.constructor.name)).toEqual([
    "ListTargetsByRuleCommand",
    "DeleteRuleCommand",
  ]);
});
