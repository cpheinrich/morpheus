import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, relative, resolve } from "node:path";
import { readTokens, renderCss, renderTs } from "../design/tokens.js";
async function unchanged(path, next) {
    try {
        return (await readFile(path, "utf8")) === next;
    }
    catch {
        return false;
    }
}
export async function build(opts) {
    const source = resolve(opts.root, opts.source ?? "hq/brand/tokens.json");
    const { tokens, issues } = await readTokens(source);
    if (issues.length) {
        console.error(`\n\x1b[31m${relative(opts.root, source)} has problems:\x1b[0m`);
        for (const i of issues)
            console.error(`  ${i}`);
        console.error("\n\x1b[2mNothing written. A stylesheet built from a half-read token file\nstill renders, which is how the mistake survives.\x1b[0m");
        return 1;
    }
    if (!tokens.length) {
        console.error(`\n\x1b[33m${relative(opts.root, source)} has no tokens yet.\x1b[0m`);
        return 1;
    }
    const prefix = opts.prefix ?? "brand";
    const rendered = [];
    const label = relative(opts.root, source);
    if (opts.css !== "") {
        const out = resolve(opts.root, opts.css ?? "app/tokens.generated.css");
        rendered.push([out, renderCss(tokens, { prefix, source: label })]);
    }
    if (opts.ts) {
        rendered.push([resolve(opts.root, opts.ts), renderTs(tokens, { prefix, source: label })]);
    }
    let stale = 0;
    for (const [path, content] of rendered) {
        const current = await unchanged(path, content);
        if (current) {
            console.log(`\x1b[2munchanged  ${relative(opts.root, path)}\x1b[0m`);
            continue;
        }
        stale++;
        if (opts.check) {
            console.error(`\x1b[31mstale      ${relative(opts.root, path)}\x1b[0m`);
            continue;
        }
        await mkdir(dirname(path), { recursive: true });
        await writeFile(path, content, "utf8");
        console.log(`\x1b[32mwrote      ${relative(opts.root, path)}\x1b[0m \x1b[2m${tokens.length} tokens\x1b[0m`);
    }
    if (opts.check && stale) {
        console.error(`\n${stale} generated file(s) are out of date. Run \`morpheus tokens build\` and commit.`);
        return 1;
    }
    return 0;
}
//# sourceMappingURL=tokens.js.map