/**
 * Older auto-updaters run this reviewed build, but cannot run new code after npm
 * replaces the global CLI. In their private, locked update clone, register the
 * existing global executable before npm replaces its package.
 */
export declare function finishLegacyContextUpdate(root?: string): Promise<void>;
