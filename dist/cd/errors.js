/** Expected resource/provider waits keep their delivery retryable without manufacturing a defect. */
export class CdWait extends Error {
    code;
    constructor(message, code) {
        super(message);
        this.code = code;
        this.name = "CdWait";
    }
}
//# sourceMappingURL=errors.js.map