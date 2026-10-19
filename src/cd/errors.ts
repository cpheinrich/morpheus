/** Expected resource/provider waits keep their delivery retryable without manufacturing a defect. */
export class CdWait extends Error {
  constructor(message: string, readonly code: string) { super(message); this.name = "CdWait"; }
}
