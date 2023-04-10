import { ArnAndFields } from "./arn.js";

export type ResourceDescriberParams = ArnAndFields;

export type ResourceDescriber = (params: ResourceDescriberParams) => Promise<string>;
