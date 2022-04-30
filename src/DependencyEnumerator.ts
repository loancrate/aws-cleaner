import { ArnAndFields } from "./arn.js";

export interface DependencyEnumeratorParams extends ArnAndFields {}

export type DependencyEnumerator = (params: DependencyEnumeratorParams) => Promise<string[]>;
