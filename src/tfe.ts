import got, { HTTPError } from "got";
import { setTimeout as sleep } from "timers/promises";
import logger from "./logger.js";

export interface TerraformConfig {
  token: string;
  organization: string;
}

function getClient(token: string) {
  return got.extend({
    prefixUrl: "https://app.terraform.io/api/v2",
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });
}

export interface TerraformWorkspace {
  id: string;
  name: string;
  locked: boolean;
  lockedByRunId?: string;
  resourceCount: number;
}

interface WorkspacesResponse {
  data: Workspace[];
  meta: {
    pagination: {
      "current-page": number;
      "page-size": number;
      "next-page": number | null;
      "prev-page": number | null;
      "total-count": number;
      "total-pages": number;
    };
  };
}

export async function getWorkspaces({ token, organization }: TerraformConfig): Promise<TerraformWorkspace[]> {
  const result: TerraformWorkspace[] = [];
  const client = getClient(token);
  for (let pageNumber = 1; ; ++pageNumber) {
    const data = await client
      .get(`organizations/${organization}/workspaces`, {
        searchParams: {
          "page[number]": pageNumber,
          "page[size]": 100,
        },
      })
      .json<WorkspacesResponse>();
    for (const item of data.data) {
      const { id } = item;
      const { name, locked, "resource-count": resourceCount } = item.attributes;
      const workspace: TerraformWorkspace = { id, name, locked, resourceCount };
      const lockedBy = item.relationships["locked-by"];
      if (lockedBy) {
        workspace.lockedByRunId = lockedBy.data.id;
      }
      result.push(workspace);
    }
    if (!data.meta.pagination["next-page"]) break;
  }
  return result;
}

interface WorkspaceResponse {
  data: Workspace;
}

interface Workspace {
  id: string;
  type: "workspaces";
  attributes: {
    "allow-destroy-plan": boolean;
    "auto-apply": boolean;
    "auto-destroy-at": string | null;
    "created-at": string;
    environment: string;
    locked: boolean;
    name: string;
    "pull-request-outputs-enabled": boolean;
    "queue-all-runs": boolean;
    "speculative-enabled": boolean;
    "structured-run-output-enabled": boolean;
    "terraform-version": string;
    "working-directory": string | null;
    "global-remote-state": boolean;
    "updated-at": string | null;
    "resource-count": number;
    "apply-duration-average": number;
    "plan-duration-average": number;
    "policy-check-failures": null;
    "run-failures": number;
    "workspace-kpis-runs-count": number;
    "latest-change-at": string | null;
    operations: boolean;
    "execution-mode": string;
    "vcs-repo": string | null;
    "vcs-repo-identifier": string | null;
    permissions: {
      "can-update": boolean;
      "can-destroy": boolean;
      "can-queue-run": boolean;
      "can-read-variable": boolean;
      "can-update-variable": boolean;
      "can-read-state-versions": boolean;
      "can-read-state-outputs": boolean;
      "can-create-state-versions": boolean;
      "can-queue-apply": boolean;
      "can-lock": boolean;
      "can-unlock": boolean;
      "can-force-unlock": boolean;
      "can-read-settings": boolean;
      "can-manage-tags": boolean;
      "can-manage-run-tasks": boolean;
      "can-manage-assessments": boolean;
      "can-read-assessment-results": boolean;
      "can-queue-destroy": boolean;
    };
    actions: {
      "is-destroyable": boolean;
    };
    description: string | null;
    "file-triggers-enabled": boolean;
    "trigger-prefixes": string[];
    "trigger-patterns": string[];
    "drift-detection": boolean;
    "last-assessment-result-at": string | null;
    source: string;
    "source-name": string | null;
    "source-url": string | null;
    "tag-names": string[];
  };
  relationships: {
    organization: {
      data: {
        id: string;
        type: "organizations";
      };
    };
    "locked-by"?: {
      data: {
        id: string;
        type: "runs";
      };
      links: {
        related: string;
      };
    };
    "current-run"?: {
      data: {
        id: string;
        type: "runs";
      };
      links: {
        related: string;
      };
    };
    "latest-run"?: {
      data: {
        id: string;
        type: "runs";
      };
      links: {
        related: string;
      };
    };
    outputs: {
      data: {
        id: string;
        type: "workspace-outputs";
      }[];
      links: {
        related: string;
      };
    };
    "remote-state-consumers": {
      links: {
        related: string;
      };
    };
    "current-state-version": {
      data: {
        id: string;
        type: "state-versions";
      };
      links: {
        related: string;
      };
    };
    "current-configuration-version": {
      data: {
        id: string;
        type: "configuration-versions";
      };
      links: {
        related: string;
      };
    };
    "agent-pool": {
      data: null;
    };
    readme: {
      data: null;
    };
    "current-assessment-result": {
      data: null;
    };
    vars: {
      data: {
        id: string;
        type: "vars";
      }[];
    };
  };
  links: {
    self: string;
  };
}

async function getWorkspace({ token }: TerraformConfig, id: string): Promise<WorkspaceResponse | null> {
  try {
    const client = getClient(token);
    const data = await client.get(`workspaces/${id}`).json<WorkspaceResponse>();
    return data;
  } catch (err) {
    if (err instanceof HTTPError && err.code === "404") {
      return null;
    }
    throw err;
  }
}

export async function isWorkspaceRunning(config: TerraformConfig, workspace: TerraformWorkspace): Promise<boolean> {
  const workspaceInfo = await getWorkspace(config, workspace.id);
  if (workspaceInfo?.data.attributes.locked) {
    const lockedBy = workspaceInfo.data.relationships["locked-by"];
    if (lockedBy) {
      const runInfo = await getRun(config, lockedBy.data.id);
      switch (runInfo?.data.attributes.status) {
        case "planned":
        case "errored":
          return false;
      }
    }
    return true;
  }
  return false;
}

export async function getWorkspaceCurrentRun(
  config: TerraformConfig,
  workspace: TerraformWorkspace
): Promise<TerraformRun | null> {
  const workspaceInfo = await getWorkspace(config, workspace.id);
  const currentRun = workspaceInfo?.data.relationships["current-run"];
  if (currentRun) {
    const runInfo = await getRun(config, currentRun.data.id);
    if (runInfo) {
      return { id: currentRun.data.id, status: runInfo.data.attributes.status, workspace };
    }
  }
  return null;
}

export async function deleteWorkspace({ token }: TerraformConfig, { id }: TerraformWorkspace): Promise<void> {
  try {
    const client = getClient(token);
    await client.delete(`workspaces/${id}`);
  } catch (err) {
    if (err instanceof HTTPError && err.code === "404") {
      return;
    }
    throw err;
  }
}

interface RunResponse {
  data: {
    id: string;
    type: "runs";
    attributes: {
      actions: {
        "is-cancelable": boolean;
        "is-confirmable": boolean;
        "is-discardable": boolean;
        "is-force-cancelable": boolean;
      };
      "allow-empty-apply": boolean;
      "auto-apply": boolean;
      "canceled-at": string | null;
      "created-at": string;
      "has-changes": boolean;
      "is-destroy": boolean;
      message: string;
      "plan-only": boolean;
      refresh: boolean;
      "refresh-only": boolean;
      "replace-addrs": string[] | null;
      source: "tfe-api" | "tfe-ui" | "tfe-configuration-version";
      "status-timestamps": {
        "plan-queueable-at": string;
        "queuing-at": string;
      };
      status: string;
      "target-addrs": string[] | null;
      "trigger-reason": string;
      "terraform-version": string;
      permissions: {
        "can-apply": boolean;
        "can-cancel": boolean;
        "can-comment": boolean;
        "can-discard": boolean;
        "can-force-execute": boolean;
        "can-force-cancel": boolean;
        "can-override-policy-check": boolean;
      };
      variables: { key: string; value: unknown }[];
    };
    relationships: {
      workspace: {
        data: {
          id: string;
          type: "workspaces";
        };
      };
      apply: {
        data: {
          id: string;
          type: "applies";
        };
        links: {
          related: string;
        };
      };
      "configuration-version": {
        data: {
          id: string;
          type: "configuration-versions";
        };
        links: {
          related: string;
        };
      };
      plan: {
        data: {
          id: string;
          type: "plans";
        };
        links: {
          related: string;
        };
      };
      "run-events": {
        data: [
          {
            id: string;
            type: "run-events";
          }
        ];
        links: {
          related: string;
        };
      };
      "task-stages": {
        data: [];
        links: {
          related: string;
        };
      };
      "policy-checks": {
        data: [];
        links: {
          related: string;
        };
      };
      comments: {
        data: [];
        links: {
          related: string;
        };
      };
    };
    links: {
      self: string;
    };
  };
}

export interface TerraformRun {
  id: string;
  status: string;
  workspace: TerraformWorkspace;
}

export async function createDestroyRun(
  config: TerraformConfig,
  workspace: TerraformWorkspace
): Promise<TerraformRun | null> {
  try {
    const client = getClient(config.token);
    const result = await client
      .post(`runs`, {
        headers: {
          "Content-Type": "application/vnd.api+json",
        },
        json: {
          data: {
            type: "runs",
            attributes: {
              "auto-apply": true,
              "is-destroy": true,
              message: "Destroy queued by aws-cleaner",
            },
            relationships: {
              workspace: {
                data: {
                  type: "workspaces",
                  id: workspace.id,
                },
              },
            },
          },
        },
      })
      .json<RunResponse>();
    return { id: result.data.id, status: result.data.attributes.status, workspace };
  } catch (err) {
    if (err instanceof HTTPError && err.code === "404") {
      return null;
    }
    throw err;
  }
}

// Usual states: plan_queued -> planning -> planned -> apply_queued -> applying -> applied
export async function waitForRun(config: TerraformConfig, { id, status, workspace }: TerraformRun): Promise<string> {
  for (;;) {
    const newStatus = await waitForRunStatusChange(config, id, status);
    logger.info(`${workspace.name} ${id} is now ${newStatus}`);
    switch (newStatus) {
      case "applied":
      case "discarded":
      case "errored":
      case "canceled":
      case "force_canceled":
      case "not_found":
        return newStatus;
    }
    status = newStatus;
  }
}

async function waitForRunStatusChange(config: TerraformConfig, id: string, status: string): Promise<string> {
  for (;;) {
    const run = await getRun(config, id);
    if (!run) {
      return "not_found";
    }
    const newStatus = run.data.attributes.status;
    if (newStatus !== status) {
      return newStatus;
    }
    logger.debug(`Waiting to poll status of ${id}, currently ${newStatus}`);
    await sleep(5000);
  }
}

export async function getRun({ token }: TerraformConfig, id: string): Promise<RunResponse | null> {
  try {
    const client = getClient(token);
    const data = await client.get(`runs/${id}`).json<RunResponse>();
    return data;
  } catch (err) {
    if (err instanceof HTTPError && err.code === "404") {
      return null;
    }
    throw err;
  }
}

export async function discardRun({ token }: TerraformConfig, id: string): Promise<boolean> {
  try {
    const client = getClient(token);
    await client.post(`runs/${id}/actions/discard`, {
      headers: {
        "Content-Type": "application/vnd.api+json",
      },
      json: {
        comment: "AWS Cleaner",
      },
    });
    return true;
  } catch (err) {
    if (err instanceof HTTPError && err.code === "409") {
      return false;
    }
    throw err;
  }
}
