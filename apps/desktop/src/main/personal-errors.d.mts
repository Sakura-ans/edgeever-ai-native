export type PublicError={code:string;message:string;action:string};
export const ERROR_CATALOG:Readonly<Record<string,readonly [string,string]>>;
export class MindError extends Error {code:string;constructor(code:string)}
export function userError(error:unknown,fallback?:string):PublicError;
export function providerError(error:unknown):MindError;
export function diagnostic(error:unknown,operation:string):{operation:string;code:string;kind:string};
export function titleProblem(value:unknown):string|null;
