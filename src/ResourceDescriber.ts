import { ArnAndFields } from "./arn.js";

export type ResourceDescriberParams = ArnAndFields;

// Returns a description of the resource, or undefined if the resource does not exist.
export type ResourceDescriber = (params: ResourceDescriberParams) => Promise<string | undefined>;
