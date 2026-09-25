export declare const MORPHEUS_SECURITY_LOGIN = "morpheus-security[bot]";
export declare const SECURITY_MARKER = "<!-- morpheus-security-update -->";
export interface SecurityFinding {
    ecosystem: string;
    dependency: string;
    version: string;
    advisory: string;
    aliases: string[];
    fixedVersion: string | null;
    sourcePath: string;
    malicious: boolean;
    withdrawn: boolean;
}
interface OsvEvent {
    introduced?: string;
    fixed?: string;
    last_affected?: string;
}
interface OsvAffected {
    ranges?: Array<{
        type?: string;
        events?: OsvEvent[];
    }>;
}
interface OsvVulnerability {
    id?: string;
    aliases?: string[];
    withdrawn?: string;
    affected?: OsvAffected[];
}
export declare function compareVersions(left: string, right: string): number;
export declare function smallestFixedVersion(vulnerability: OsvVulnerability, installed: string): string | null;
export declare function findingsFromOsvJson(value: unknown): SecurityFinding[];
export declare function findingKey(finding: Pick<SecurityFinding, "ecosystem" | "dependency" | "advisory">): string;
export declare function isSecurityDependencyOnly(paths: string[]): boolean;
export declare function hasSecurityMarker(body: string): boolean;
export {};
