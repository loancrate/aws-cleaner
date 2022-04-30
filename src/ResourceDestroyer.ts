import { ArnAndFields } from "./arn.js";
import { Poller } from "./poll.js";

export interface ResourceDestroyerParams extends ArnAndFields {
  poller: Poller;
}

export type ResourceDestroyer = (params: ResourceDestroyerParams) => Promise<unknown>;
