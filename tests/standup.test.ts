import { describe, expect, it } from "vitest";
import { parseStandup } from "../src/standup/parse.js";

const FM = `---
person: chris
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

describe("parseStandup", () => {
  it("parses frontmatter, summary, and items", () => {
    const r = parseStandup("s.md", doc(doneItem(1), openItem(2)));
    expect(r.issues).toHaveLength(0);
    expect(r.meta.person).toBe("chris");
    expect(r.summary).toContain("Shipped the claim mechanism");
    expect(r.items).toHaveLength(2);
    expect(r.items[0]!.state).toBe("done");
    expect(r.items[1]!.state).toBe("open");
  });

  it("flags an open item with no reply slot", () => {
    const bad = `\n## ❗ 1. No slot · \`claude\`\n\nMy answer with nowhere to reply.\n`;
    const r = parseStandup("s.md", doc(bad));
    expect(r.issues.some((i) => i.message.includes("no empty `~` reply slot"))).toBe(true);
  });

  it("flags a done item that still offers a reply slot", () => {
    const bad = `\n## ✅ 1. Done but open · \`claude\`\n\nDone.\n\n~\n`;
    const r = parseStandup("s.md", doc(bad));
    expect(r.issues.some((i) => i.message.includes("still offers a reply slot"))).toBe(true);
  });

  it("flags non-sequential numbering", () => {
    const r = parseStandup("s.md", doc(doneItem(1), openItem(3)));
    expect(r.issues.some((i) => i.message.includes("not sequential"))).toBe(true);
  });

  it("flags a standup with no summary", () => {
    const r = parseStandup("s.md", FM + openItem(1));
    expect(r.issues.some((i) => i.message.includes("no summary"))).toBe(true);
  });

  it("extracts the agent and an optional roadmap link", () => {
    const item = `\n## ❗ 1. Wire analytics · \`codex\` · [RM-006](x.md)\n\n~\n`;
    const r = parseStandup("s.md", doc(item));
    expect(r.items[0]!.agent).toBe("codex");
    expect(r.items[0]!.roadmap).toBe("RM-006");
  });

  it("leaves roadmap undefined when an item is not a task", () => {
    const r = parseStandup("s.md", doc(openItem(1)));
    expect(r.items[0]!.roadmap).toBeUndefined();
  });

  it("rejects frontmatter missing a person", () => {
    const r = parseStandup("s.md", "---\ndate: 2026-07-29\nagents: [claude]\n---\n" + SUMMARY);
    expect(r.issues.some((i) => i.message.includes("frontmatter person"))).toBe(true);
  });

  it("reports malformed YAML rather than throwing", () => {
    const r = parseStandup("s.md", "---\nperson: a: b\n---\n");
    expect(r.issues[0]!.message).toContain("invalid YAML frontmatter");
  });
});
