import { z } from "zod";
export declare const meetingSlug: z.ZodString;
/** The canonical note extension shared by every Gemini meeting-intake profile. */
export declare const DiscoveryNote: z.ZodObject<{
    id: z.ZodString;
    title: z.ZodString;
    occurred: z.ZodPreprocess<z.ZodISODateTime>;
    attendees: z.ZodArray<z.ZodString>;
    recorded_by: z.ZodString;
    source: z.ZodEnum<{
        readonly session: "session";
        readonly granola: "granola";
        readonly manual: "manual";
        readonly otter: "otter";
        readonly zoom: "zoom";
    }>;
    source_ref: z.ZodOptional<z.ZodString>;
    duration_minutes: z.ZodOptional<z.ZodNumber>;
    roadmap: z.ZodDefault<z.ZodArray<z.ZodString>>;
    redacted: z.ZodDefault<z.ZodBoolean>;
    created: z.ZodPreprocess<z.ZodISODate>;
    discovery_version: z.ZodLiteral<1>;
    projects: z.ZodArray<z.ZodString>;
    topics: z.ZodArray<z.ZodString>;
    summary: z.ZodString;
    project_summaries: z.ZodDefault<z.ZodRecord<z.ZodString, z.ZodString>>;
    intake_policy: z.ZodEnum<{
        current: "current";
        "historical-notes-only": "historical-notes-only";
    }>;
    source_kind: z.ZodEnum<{
        "session-summary": "session-summary";
        "gemini-generated-notes": "gemini-generated-notes";
    }>;
    source_coverage: z.ZodEnum<{
        session: "session";
        "full-notes": "full-notes";
        "email-summary": "email-summary";
        "notes-and-transcript": "notes-and-transcript";
    }>;
    source_ids: z.ZodDefault<z.ZodObject<{
        gmail_messages: z.ZodDefault<z.ZodArray<z.ZodString>>;
        google_documents: z.ZodDefault<z.ZodArray<z.ZodString>>;
        calendar_events: z.ZodDefault<z.ZodArray<z.ZodString>>;
    }, z.core.$strip>>;
    occurred_basis: z.ZodOptional<z.ZodEnum<{
        "meeting-start": "meeting-start";
        "scheduled-start": "scheduled-start";
        "notes-session-start": "notes-session-start";
    }>>;
    related: z.ZodDefault<z.ZodArray<z.ZodString>>;
}, z.core.$strip>;
export type DiscoveryNote = z.infer<typeof DiscoveryNote>;
export declare const MeetingIntakeConfig: z.ZodObject<{
    schemaVersion: z.ZodLiteral<1>;
    project: z.ZodString;
    timeZone: z.ZodString;
    canonical: z.ZodObject<{
        repository: z.ZodString;
        directory: z.ZodString;
        webBase: z.ZodURL;
    }, z.core.$strip>;
    projection: z.ZodOptional<z.ZodObject<{
        directory: z.ZodString;
        title: z.ZodString;
        description: z.ZodString;
        contextLabel: z.ZodOptional<z.ZodString>;
        runbook: z.ZodOptional<z.ZodString>;
    }, z.core.$strip>>;
    gmail: z.ZodObject<{
        account: z.ZodEmail;
        noteSenders: z.ZodArray<z.ZodEmail>;
        failureSenders: z.ZodDefault<z.ZodArray<z.ZodEmail>>;
    }, z.core.$strip>;
    collaborators: z.ZodRecord<z.ZodString, z.ZodArray<z.ZodEmail>>;
    topicVocabulary: z.ZodArray<z.ZodString>;
    notification: z.ZodOptional<z.ZodObject<{
        adapter: z.ZodLiteral<"zoe-text">;
        recipient: z.ZodString;
        authorized: z.ZodLiteral<true>;
    }, z.core.$strip>>;
}, z.core.$strip>;
export type MeetingIntakeConfig = z.infer<typeof MeetingIntakeConfig>;
export declare function parseMeetingIntakeConfig(input: unknown): MeetingIntakeConfig;
export declare function validateNotePolicy(note: DiscoveryNote, config: MeetingIntakeConfig): void;
