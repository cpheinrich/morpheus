import { createHash } from "node:crypto";
import { z } from "zod";
import { DiscoveryNote, meetingSlug, validateNotePolicy, } from "./schema.js";
const fullRevision = /^[a-f0-9]{40}$/;
function notePathPattern(directory) {
    const escaped = directory.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    return new RegExp(`^${escaped}/[\\w.-]+\\.md$`);
}
function sourceKeys(note) {
    const keys = [
        ...note.source_ids.gmail_messages.map((id) => `gmail:${id}`),
        ...note.source_ids.google_documents.map((id) => `document:${id}`),
        ...note.source_ids.calendar_events.map((id) => `calendar:${id}`),
    ];
    const document = note.source_ref?.match(/docs\.google\.com\/document\/d\/([\w-]+)/)?.[1];
    if (document)
        keys.push(`document:${document}`);
    return [...new Set(keys)];
}
/** Pure projection. Repository IO, collaborators, topics and destinations stay in config. */
export function buildCatalog(records, revision, config) {
    if (!fullRevision.test(revision))
        throw new Error("Source must resolve to a full commit SHA");
    const ids = new Set();
    const sources = new Map();
    const paths = notePathPattern(config.canonical.directory);
    const entries = [];
    for (const record of records) {
        const note = DiscoveryNote.parse(record.data);
        if (ids.has(note.id))
            throw new Error(`Duplicate meeting id: ${note.id}`);
        ids.add(note.id);
        for (const key of sourceKeys(note)) {
            const first = sources.get(key);
            if (first)
                throw new Error(`Duplicate source identity: ${note.id} also appears in ${first}`);
            sources.set(key, note.id);
        }
        if (!paths.test(record.path))
            throw new Error(`Invalid canonical record path: ${record.path}`);
        if (!note.projects.includes(config.project))
            continue;
        validateNotePolicy(note, config);
        const summary = note.project_summaries[config.project] ??
            (note.projects.length === 1 ? note.summary : undefined);
        if (!summary)
            throw new Error(`Mixed meeting needs a ${config.project} summary: ${note.id}`);
        const filename = record.path.split("/").at(-1).replace(/\.md$/, "");
        entries.push({
            id: note.id,
            occurred: note.occurred,
            title: note.title,
            summary,
            projects: note.projects,
            topics: note.topics,
            attendees: note.attendees,
            policy: note.intake_policy,
            sourceKind: note.source_kind,
            sourceCoverage: note.source_coverage,
            related: note.related,
            noteDigest: createHash("sha256").update(record.raw).digest("hex"),
            path: record.path,
            url: `${config.canonical.webBase.replace(/\/$/, "")}/${encodeURIComponent(filename)}/`,
            repositoryUrl: `https://github.com/${config.canonical.repository}/blob/${revision}/${record.path}`,
        });
    }
    entries.sort((left, right) => Date.parse(right.occurred) - Date.parse(left.occurred) || left.id.localeCompare(right.id));
    return {
        schemaVersion: 1,
        project: config.project,
        source: {
            repository: config.canonical.repository,
            revision,
            directory: config.canonical.directory,
        },
        entries,
    };
}
const cell = (value) => value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/[\[\]`*_]/g, "\\$&")
    .replace(/\|/g, "&#124;");
export function renderIndex(catalog, config) {
    const projection = config.projection;
    if (!projection)
        throw new Error("This profile has no catalog projection");
    const date = new Intl.DateTimeFormat("en-US", {
        dateStyle: "medium",
        timeZone: config.timeZone,
    });
    const prefixDate = new Intl.DateTimeFormat("en-US", {
        month: "long",
        day: "numeric",
        timeZone: config.timeZone,
    });
    const title = (note) => {
        const prefix = `${prefixDate.format(new Date(note.occurred))}: `;
        return cell(note.title.startsWith(prefix) ? note.title.slice(prefix.length) : note.title);
    };
    const context = projection.contextLabel ?? config.project;
    const runbook = projection.runbook
        ? `\n\nRegeneration and intake: [runbook](${projection.runbook}).`
        : "";
    return (`# ${projection.title}\n\n` +
        `${projection.description}\n\n` +
        `Search metadata first with \`morpheus meeting-intake search --query "context" --limit 5\` ` +
        `or \`--topic ${config.topicVocabulary[0]}\`. Open only relevant canonical records; do not load the archive ` +
        `at session startup.\n\n` +
        `Source: [${catalog.source.repository} at ${catalog.source.revision.slice(0, 12)}]` +
        `(https://github.com/${catalog.source.repository}/tree/${catalog.source.revision}/${catalog.source.directory}). ` +
        `The JSON catalog carries stable IDs, exact source paths/digests and related record IDs. ` +
        `Check the source revision before relying on a cached summary.\n\n` +
        `| Date | Meeting and ${cell(context)} context | Topics | Coverage | Policy |\n` +
        `| --- | --- | --- | --- | --- |\n` +
        catalog.entries
            .map((note) => `| ${date.format(new Date(note.occurred))} | [${title(note)}](${note.url}) — ${cell(note.summary)} | ` +
            `${note.topics.join(", ")} | ${note.sourceCoverage} | ${note.policy} |`)
            .join("\n") +
        `\n\nHistorical records are context only: do not create tasks or reopen completed work from them. ` +
        `Current action delivery is tracked separately; an empty roadmap list is not a retry signal.` +
        runbook +
        `\n\nNo transcript, credentials or copied full meeting body belongs in this projection.\n`);
}
export function searchCatalog(catalog, query = "", topic, limit = 5) {
    if (!Number.isInteger(limit) || limit < 1 || limit > 20) {
        throw new Error("Limit must be 1–20");
    }
    const words = query.toLowerCase().split(/\s+/).filter(Boolean);
    return catalog.entries
        .filter((note) => (!topic || note.topics.includes(topic)) &&
        words.every((word) => [note.id, note.title, note.summary, ...note.topics, ...note.related]
            .join(" ")
            .toLowerCase()
            .includes(word)))
        .slice(0, limit);
}
/** This gate formats a notice; the configured adapter owns actual delivery and reconciliation. */
export function completionNotice(record, config) {
    if (!config.notification?.authorized) {
        throw new Error("This profile does not authorize a completion notice");
    }
    const delivery = z
        .object({
        note: z.object({
            status: z.literal("verified"),
            prUrl: z.url(),
            revision: z.string().regex(fullRevision),
        }),
        index: z.discriminatedUnion("status", [
            z.object({
                status: z.literal("verified"),
                prUrl: z.url(),
                revision: z.string().regex(fullRevision),
                noteDigest: z.string().regex(/^[a-f0-9]{64}$/),
            }),
            z.object({ status: z.literal("not-applicable") }),
        ]),
        actions: z.object({
            status: z.literal("recorded"),
            count: z.number().int().nonnegative(),
        }),
    })
        .parse(record.delivery);
    const note = z
        .object({
        occurred: z.iso.datetime({ offset: true }),
        projects: z.array(meetingSlug).min(1),
        hqUrl: z.url(),
        noteSha256: z.string().regex(/^[a-f0-9]{64}$/),
        intakePolicy: z.literal("current"),
    })
        .parse(record);
    if (!note.projects.includes(config.project)) {
        throw new Error(`Meeting is outside the ${config.project} project scope`);
    }
    const projectionRequired = note.projects.includes(config.project) && Boolean(config.projection);
    if (projectionRequired && delivery.index.status !== "verified") {
        throw new Error("This meeting requires the configured project index");
    }
    if (delivery.index.status === "verified" && delivery.index.noteDigest !== note.noteSha256) {
        throw new Error("The project index is stale");
    }
    const notification = z
        .object({ status: z.enum(["pending", "sending", "sent", "uncertain"]) })
        .passthrough()
        .optional()
        .parse(record.notification);
    if (notification?.status && notification.status !== "pending") {
        throw new Error("Notice already sent or delivery uncertain: reconcile before retry");
    }
    const url = new URL(note.hqUrl);
    const base = new URL(config.canonical.webBase);
    if (url.origin !== base.origin ||
        !url.pathname.startsWith(`${base.pathname.replace(/\/$/, "")}/`) ||
        url.search ||
        url.hash) {
        throw new Error("Notice URL is outside canonical HQ");
    }
    const date = new Intl.DateTimeFormat("en-US", {
        dateStyle: "long",
        timeZone: config.timeZone,
    }).format(new Date(note.occurred));
    return (`Meeting notes for ${date} have been summarized and recorded` +
        (delivery.actions.count
            ? ", along with the action items"
            : "; no new action items were filed") +
        `. ${note.hqUrl}`);
}
//# sourceMappingURL=core.js.map