export declare const MORPHEUS_SECURITY_LOGIN = "morpheus-security[bot]";
export declare const SECURITY_MARKER = "<!-- morpheus-security-update -->";
export declare function isSecurityDependencyOnly(paths: string[]): boolean;
export declare function hasSecurityMarker(body: string): boolean;
