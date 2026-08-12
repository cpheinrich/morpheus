export interface FirebaseAuthOptions {
    project?: string;
    domain?: string;
    supportEmail?: string;
    brand?: string;
    openBrowser: boolean;
}
export declare function configureGoogleAuth(root: string, opts: FirebaseAuthOptions): Promise<number>;
export declare function checkGoogleAuthConfiguration(root: string, opts: FirebaseAuthOptions): Promise<number>;
