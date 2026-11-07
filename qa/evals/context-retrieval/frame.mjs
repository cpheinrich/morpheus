import { createHash } from 'node:crypto';
import { posix } from 'node:path';

const taskId = /^[A-Z][A-Z0-9]+-\d{2}-\d{2}-\d{2}-\d{2}\.\d{2}\.\d{2}$/;
const taskMention = /\b[A-Z][A-Z0-9]+-\d{2}-\d{2}-\d{2}-\d{2}\.\d{2}\.\d{2}\b/gi;
const markdownLink = /!?\[([^\]]*)\]\((?:<([^>]+)>|([^\s)]+))(?:\s+"[^"]*")?\)/g;
const prReference = /(?:https:\/\/github\.com\/([\w.-]+\/[\w.-]+)\/pull\/(\d+)|\b([\w.-]+\/[\w.-]+)#(\d+))/gi;
const hash = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');
const compare = (a, b) => a < b ? -1 : a > b ? 1 : 0;
const words = text => text.toLowerCase().match(/[\p{L}\p{N}]+/gu) ?? [];
const isRoadmap = path => /(?:^|\/)roadmap\//.test(path);
const isWorklog = path => path.startsWith('.agent/worklog/');
const isMeeting = path => /(?:^|\/)meeting-notes\//.test(path);

function frontmatter(lines) {
  if (lines[0] !== '---') return { fields: new Map(), end: 0 };
  const end = lines.indexOf('---', 1);
  if (end === -1) return { fields: new Map(), end: 0 };
  const fields = new Map();
  let key;
  for (const line of lines.slice(1, end)) {
    const field = /^([\w-]+):\s*(.*)$/.exec(line);
    if (field) {
      key = field[1];
      fields.set(key, field[2]);
    } else if (key && /^ +-/u.test(line)) {
      fields.set(key, fields.get(key) + '\n' + line.trim());
    }
  }
  return { fields, end: end + 1 };
}

function scalar(value = '') {
  const quote = value[0];
  if ((quote === '"' || quote === "'") && value.endsWith(quote)) {
    return value.slice(1, -1).replaceAll(quote === '"' ? '\\"' : "''", quote);
  }
  return value.replace(/\s+#.*$/, '').trim();
}

function slug(text) {
  return text.toLowerCase().replace(/[^\p{L}\p{N}_ -]/gu, '').replaceAll(' ', '-');
}

function scan(document) {
  const { fields, end } = frontmatter(document.lines);
  const body = [];
  const headings = [];
  const anchors = new Set();
  let fence;
  for (let index = end; index < document.lines.length; index++) {
    const text = document.lines[index];
    const delimiter = /^ {0,3}(`{3,}|~{3,})/.exec(text)?.[1];
    if (delimiter && !fence) {
      fence = delimiter;
      continue;
    }
    if (fence) {
      if (delimiter?.startsWith(fence) && /^ {0,3}[`~]+\s*$/.test(text)) fence = undefined;
      continue;
    }
    const line = index + 1;
    const heading = /^ {0,3}(#{1,6})\s+(.+?)(?:\s+#+)?\s*$/.exec(text);
    if (heading) {
      const base = slug(heading[2]);
      let anchor = base;
      for (let suffix = 1; anchors.has(anchor); suffix++) anchor = base + '-' + suffix;
      anchors.add(anchor);
      headings.push({ level: heading[1].length, title: heading[2], anchor, line });
    } else {
      body.push({ text, line });
    }
  }
  return { ...document, fields, body, headings, title: scalar(fields.get('title')) || headings[0]?.title || '' };
}

function evidenceLine(document, start = 0, end = Infinity) {
  return document.body.find(({ line, text }) =>
    line > start && line < end && text.length >= 32 && text.length <= 360 &&
    !/^\s*[|>\[{]|^\s*[-*_]{3,}\s*$/.test(text) && words(text).length >= 6);
}

function evidenceInSection(document, heading) {
  const next = document.headings.find(candidate => candidate.line > heading.line);
  return evidenceLine(document, heading.line, next?.line);
}

function target(path, evidence) {
  return { path, first: evidence.line, last: evidence.line };
}

function queryText(text) {
  return text.replace(markdownLink, ' ').replace(prReference, ' ').replace(taskMention, ' ')
    .replace(/https?:\/\/\S+/g, ' ').replace(/`[^`]*`/g, ' ').replace(/[*_~]/g, '')
    .replace(/\s+/g, ' ').trim();
}

function descriptive(text, targets) {
  const description = queryText(text).slice(0, 180).trim();
  if (words(description).length < 3) return '';
  const terms = words(description);
  const phrases = terms.slice(7).map((_, index) => ' ' + terms.slice(index, index + 8).join(' ') + ' ');
  const copiesTarget = targets.some(({ document, evidence }) => {
    const body = ' ' + words(evidence.text).join(' ') + ' ';
    return phrases.some(phrase => body.includes(phrase)) ||
      description.toLowerCase().includes(document.path.toLowerCase());
  });
  return copiesTarget ? '' : description;
}

function qualifiedPrKeys(value) {
  return [...value.matchAll(prReference)].map(match =>
    'pr:' + (match[1] ?? match[3]).toLowerCase() + '#' + (match[2] ?? match[4]));
}

function prKeys(project, fields) {
  const keys = [];
  const local = project.repository?.toLowerCase() ?? project.name;
  for (const field of ['prs', 'pullRequests']) {
    const value = fields.get(field) ?? '';
    const numbers = value.trim().replace(/^\[|\]$/g, '').split(/[,\n]/);
    for (const number of numbers.map(part => part.trim().replace(/^-\s+/, ''))) {
      if (/^\d+$/.test(number)) keys.push('pr:' + local + '#' + number);
    }
    keys.push(...qualifiedPrKeys(value));
  }
  return keys;
}

function taskCases(project, docs, add) {
  const roadmaps = new Map();
  const worklogs = new Map();
  for (const document of docs.values()) {
    if (isRoadmap(document.path)) {
      const id = scalar(document.fields.get('id'));
      if (taskId.test(id)) roadmaps.set(id, roadmaps.has(id) ? null : document);
    } else if (isWorklog(document.path)) {
      const id = scalar(document.fields.get('roadmap'));
      const evidence = evidenceLine(document);
      if (!taskId.test(id) || !evidence) continue;
      if (!worklogs.has(id)) worklogs.set(id, []);
      worklogs.get(id).push({ document, evidence });
    }
  }
  for (const [id, entries] of worklogs) {
    const roadmap = roadmaps.get(id);
    if (!roadmap) continue;
    const paths = [roadmap.path, ...entries.map(({ document }) => document.path)];
    const keys = ['task:' + project.name + ':' + id, ...prKeys(project, roadmap.fields),
      ...entries.flatMap(({ document }) => prKeys(project, document.fields))];
    const targets = entries.map(({ document, evidence }) => target(document.path, evidence));
    add('literal-id', id, 'Work log for ' + id, paths, keys, targets);
    const description = descriptive(roadmap.title, entries);
    if (description) {
      add('descriptive-task', id, 'Work log for ' + description, paths, keys, targets, [roadmap.path]);
    }
  }
}

function resolveLink(source, href, docs) {
  if (/^(?:\w+:|\/)/.test(href)) return undefined;
  const separator = href.indexOf('#');
  if (separator < 0) return undefined;
  try {
    const filename = decodeURIComponent(href.slice(0, separator));
    const anchor = decodeURIComponent(href.slice(separator + 1));
    if (!anchor || filename.includes('?')) return undefined;
    const path = filename ? posix.normalize(posix.join(posix.dirname(source), filename)) : source;
    const document = docs.get(path);
    const heading = document?.headings.find(candidate => candidate.anchor === anchor);
    if (heading) return { document, heading };
  } catch (error) {
    if (!(error instanceof URIError)) throw error;
  }
  return undefined;
}

function linkedCases(docs, add) {
  const used = new Set();
  for (const source of docs.values()) {
    // Indexes and task records often enumerate many unrelated links.
    if (isRoadmap(source.path) || isWorklog(source.path) ||
        /(?:^|\/)(?:readme|index)\.md$/i.test(source.path)) continue;
    for (const { text } of source.body) {
      // One description must resolve to one section.
      const links = [...text.matchAll(markdownLink)].filter(match => !match[0].startsWith('!'));
      if (links.length !== 1) continue;
      const link = resolveLink(source.path, links[0][2] ?? links[0][3], docs);
      if (!link) continue;
      const { document, heading } = link;
      const key = document.path + '#' + heading.anchor;
      if (used.has(key)) continue;
      const evidence = evidenceInSection(document, heading);
      if (!evidence) continue;
      const description = descriptive(text, [{ document, evidence }]);
      if (!description) continue;
      const paths = [...new Set([source.path, document.path])];
      const exclude = paths.length > 1 ? [source.path] : [];
      used.add(key);
      add('linked-section', key, 'Find project guidance for ' + description, paths,
        [...qualifiedPrKeys(text), ...qualifiedPrKeys(evidence.text)],
        [target(document.path, evidence)], exclude);
    }
  }
}

function meetingCases(docs, add) {
  for (const document of docs.values()) {
    if (!isMeeting(document.path) || !document.title) continue;
    const date = /\d{4}-\d{2}-\d{2}/.exec(document.fields.get('occurred') ?? '')?.[0];
    for (const heading of document.headings) {
      if (heading.level < 2 || !/^(?:key )?(?:decisions|action items|open questions)$/i.test(heading.title)) continue;
      const evidence = evidenceInSection(document, heading);
      if (!evidence) continue;
      const description = descriptive(document.title, [{ document, evidence }]);
      if (!description) continue;
      const suffix = date ? ' (' + date + ')' : '';
      add('meeting-section', document.path + '#' + heading.anchor,
        heading.title + ' from the meeting about ' + description + suffix, [document.path], qualifiedPrKeys(evidence.text),
        [target(document.path, evidence)]);
    }
  }
}

function components(cases) {
  const parents = new Map();
  const owners = new Map();
  function root(id) {
    const parent = parents.get(id);
    if (parent === id) return id;
    const result = root(parent);
    parents.set(id, result);
    return result;
  }
  for (const { id, keys } of cases) {
    parents.set(id, id);
    for (const key of keys) {
      const owner = owners.get(key);
      if (owner) parents.set(root(id), root(owner));
      else owners.set(key, id);
    }
  }
  const groups = new Map();
  for (const item of cases) {
    const key = root(item.id);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(item);
  }
  return groups.values();
}

function assignSplit(cases, seed, isScored) {
  const strata = new Map();
  for (const related of components(cases)) {
    const members = related.filter(isScored);
    if (!members.length) continue;
    const group = hash(related.map(member => member.id).sort(compare));
    for (const member of members) {
      member.group = group;
      member.split = 'dev';
    }
    if (related.some(member => member.exposed)) continue;
    const stratum = [...new Set(related.map(member => member.project))].sort(compare).join(',');
    if (!strata.has(stratum)) strata.set(stratum, []);
    strata.get(stratum).push({ members, rank: hash([seed, stratum, group]) });
  }
  for (const groups of strata.values()) {
    groups.sort((a, b) => compare(a.rank, b.rank));
    for (const group of groups.slice(0, Math.round(groups.length / 3))) {
      for (const member of group.members) member.split = 'holdout';
    }
  }
}

/** Exposed paths are keyed by project name. The entire connected component stays in dev. */
export function buildFrame(projects, { seed = 'context-retrieval-v1', exposedPaths = {} } = {}) {
  const cases = [];
  for (const project of [...projects].sort((a, b) => compare(a.name, b.name))) {
    const docs = new Map([...project.documents].sort(([a], [b]) => compare(a, b))
      .map(([path, document]) => [path, scan(document)]));
    const exposed = new Set(exposedPaths[project.name] ?? []);
    function add(kind, key, query, paths, otherKeys, targets, exclude = []) {
      cases.push({
        id: hash([project.name, kind, key]), project: project.name, kind, query, exclude, targets,
        keys: [...paths.map(path => 'path:' + project.name + ':' + path), ...otherKeys],
        exposed: paths.some(path => exposed.has(path)),
      });
    }
    taskCases(project, docs, add);
    linkedCases(docs, add);
    meetingCases(docs, add);
  }
  const queryCounts = new Map();
  const queryKey = item => JSON.stringify([item.project, words(item.query)]);
  for (const item of cases) {
    const key = queryKey(item);
    queryCounts.set(key, (queryCounts.get(key) ?? 0) + 1);
  }
  const isScored = item => queryCounts.get(queryKey(item)) === 1;
  assignSplit(cases, seed, isScored);
  return cases.filter(isScored).map(({ keys, exposed, ...item }) => item);
}
