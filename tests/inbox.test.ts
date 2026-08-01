import { describe, expect, it } from "vitest";
import { parseInbox } from "../src/inbox/parse.js";
import { archiveName } from "../src/inbox/schema.js";

const FM = `---
owner: cpheinrich
date: 2026-07-29
agents: [claude]
---
`;

const SUMMARY = "\nShipped the claim mechanism and split inboxes per person.\n";

function doc(...items: string[]) {
  return FM + SUMMARY + items.join("\n");
}

const openItem = (n: number, title = "Needs a decision") =>
  `\n## ❗ ${n}. ${title} · \`claude\`\n\n~ *(previous reply)*\n\nMy answer.\n\n~\n`;

const doneItem = (n: number, title = "Already handled") =>
  `\n## ✅ ${n}. ${title} · \`claude\`\n\n~ *(previous reply)*\n\nDone.\n`;

describe("parseInbox", () => {
  it("parses frontmatter, summary, and items", () => {
    const r = parseInbox("s.md", doc(doneItem(1), openItem(2)));
    expect(r.issues).toHaveLength(0);
    expect(r.meta.owner).toBe("cpheinrich");
    expect(r.summary).toContain("Shipped the claim mechanism");
    expect(r.items).toHaveLength(2);
    expect(r.items[0]!.state).toBe("done");
    expect(r.items[1]!.state).toBe("open");
  });

  it("flags an open item with no reply slot", () => {
    const bad = `\n## ❗ 1. No slot · \`claude\`\n\nMy answer with nowhere to reply.\n`;
    const r = parseInbox("s.md", doc(bad));
    expect(r.issues.some((i: { message: string }) => i.message.includes("no empty `~` reply slot"))).toBe(true);
  });

  it("flags a done item that still offers a reply slot", () => {
    const bad = `\n## ✅ 1. Done but open · \`claude\`\n\nDone.\n\n~\n`;
    const r = parseInbox("s.md", doc(bad));
    expect(r.issues.some((i: { message: string }) => i.message.includes("still offers a reply slot"))).toBe(true);
  });

  it("flags non-sequential numbering", () => {
    const r = parseInbox("s.md", doc(doneItem(1), openItem(3)));
    expect(r.issues.some((i: { message: string }) => i.message.includes("not sequential"))).toBe(true);
  });

  it("flags an inbox with no summary", () => {
    const r = parseInbox("s.md", FM + openItem(1));
    expect(r.issues.some((i: { message: string }) => i.message.includes("no summary"))).toBe(true);
  });

  it("extracts the agent and an optional roadmap link", () => {
    const item = `\n## ❗ 1. Wire analytics · \`codex\` · [RM-006](x.md)\n\n~\n`;
    const r = parseInbox("s.md", doc(item));
    expect(r.items[0]!.agent).toBe("codex");
    expect(r.items[0]!.roadmap).toBe("RM-006");
  });

  // Ids were namespaced per project in MO-002 and this pattern still read
  // `RM-`, so no current id could match it — every roadmap link in every
  // heading had been silently dropped since.
  it("extracts a project-prefixed id, not only the legacy RM- one", () => {
    const item = `\n## ❗ 1. Blocked: agent review · \`claude\` · [MO-051](../product/roadmap/MO-051.md)\n\n~\n`;
    expect(parseInbox("s.md", doc(item)).items[0]!.roadmap).toBe("MO-051");
  });

  it("still reads the legacy RM- ids sitting in the archive", () => {
    const item = `\n## ❗ 1. Old one · \`claude\` · [RM-004](x.md)\n\n~\n`;
    expect(parseInbox("s.md", doc(item)).items[0]!.roadmap).toBe("RM-004");
  });

  it("leaves roadmap undefined when an item is not a task", () => {
    const r = parseInbox("s.md", doc(openItem(1)));
    expect(r.items[0]!.roadmap).toBeUndefined();
  });

  it("rejects frontmatter missing a person", () => {
    const r = parseInbox("s.md", "---\ndate: 2026-07-29\nagents: [claude]\n---\n" + SUMMARY);
    expect(r.issues.some((i: { message: string }) => i.message.includes("frontmatter owner"))).toBe(true);
  });

  it("reports malformed YAML rather than throwing", () => {
    const r = parseInbox("s.md", "---\nowner: a: b\n---\n");
    expect(r.issues[0]!.message).toContain("invalid YAML frontmatter");
  });
});

describe("owner handle", () => {
  it("rejects an owner that is not a GitHub handle", () => {
    const r = parseInbox("s.md", "---\nowner: not a handle\ndate: 2026-07-29\nagents: [claude]\n---\n\nSummary.\n");
    expect(r.issues.some((i: { message: string }) => i.message.includes("GitHub handle"))).toBe(true);
  });
});

describe("archiveName", () => {
  it("leads with the date so the archive reads as one timeline", () => {
    expect(archiveName("cpheinrich", new Date("2026-07-29T04:07:00Z"))).toBe(
      "2026-07-29-0407-cpheinrich.md",
    );
  });

  it("keeps two people on the same day distinct", () => {
    const t = new Date("2026-07-29T04:07:00Z");
    expect(archiveName("cpheinrich", t)).not.toBe(archiveName("alex", t));
  });
});
