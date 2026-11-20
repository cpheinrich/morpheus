import { type AppResearchStudy } from "./index.js";
export { fetchAppeekySnapshot, type AppeekyRequest, type AppeekyFetchOptions } from "./appeeky.js";
export type StudyDirectoryIssue = {
    path: string;
    message: string;
};
export type StudyDirectoryResult = {
    study: AppResearchStudy | null;
    issues: StudyDirectoryIssue[];
};
/**
 * Validate a study directory for an offline, repeatable import: `study.json` parses, and the
 * directory holds exactly the files its asset inventory names — no symlinks, nothing extra or
 * missing, each with the recorded byte count and SHA-256. A directory that passes can be uploaded
 * object-for-object and served to the viewer without further checks on the server.
 */
export declare function validateStudyDirectory(directory: string): Promise<StudyDirectoryResult>;
