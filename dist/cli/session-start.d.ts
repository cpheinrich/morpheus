import { type SessionStartInput } from "../session/start.js";
import { type BriefOptions } from "./context.js";
/** Hooks pipe JSON; interactive calls must not wait for terminal input. */
export declare function sessionHookInput(): Promise<SessionStartInput>;
export declare function startSession(root: string, input: SessionStartInput, opts?: BriefOptions): Promise<number>;
