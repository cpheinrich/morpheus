export interface Flags {
  dir: string;
  base: string;
  name?: string;
  prefix?: string;
  check: boolean;
  project?: string;
  domain?: string;
  supportEmail?: string;
  brand?: string;
  account?: string;
  organization?: string;
  vercelTeam?: string;
  stagingProject?: string;
  bucket?: string;
  objectPrefix?: string;
  catalogDir?: string;
  localRoot?: string;
  gcloud?: string;
  provision: boolean;
  waitlist: boolean;
  hq: boolean;
  openBrowser: boolean;
  dryRun: boolean;
  all: boolean;
  offline: boolean;
  kind?: string;
  owner?: string;
  handle?: string;
  source?: string;
  css?: string;
  ts?: string;
  priority?: string;
  goal?: string;
  slug?: string;
  issue?: string;
  needs?: string;
  context?: string;
  ceiling?: number;
  notes?: string;
  priorReview?: string;
  beforeCommentId?: string;
  commentId?: string;
  bodyFile?: string;
  prBodyFile?: string;
  selection?: string;
  title?: string;
  authors: string[];
  edition?: string;
  publisher?: string;
  year?: string;
  isbns: string[];
  language?: string;
  rulesPath?: string;
  out?: string;
  full: boolean;
  json: boolean;
  dispatch: boolean;
  print: boolean;
  positional: string[];
}

const stringOptions: Record<string, (flags: Flags, value: string | undefined) => void> = {
  "--project": (flags, value) => { flags.project = value; },
  "--bucket": (flags, value) => { flags.bucket = value; },
  "--object-prefix": (flags, value) => { flags.objectPrefix = value; },
  "--catalog-dir": (flags, value) => { flags.catalogDir = value; },
  "--local-root": (flags, value) => { flags.localRoot = value; },
  "--gcloud": (flags, value) => { flags.gcloud = value; },
  "--domain": (flags, value) => { flags.domain = value; },
  "--support-email": (flags, value) => { flags.supportEmail = value; },
  "--brand": (flags, value) => { flags.brand = value; },
  "--staging-project": (flags, value) => { flags.stagingProject = value; },
  "--account": (flags, value) => { flags.account = value; },
  "--organization": (flags, value) => { flags.organization = value; },
  "--vercel-team": (flags, value) => { flags.vercelTeam = value; },
  "--name": (flags, value) => { flags.name = value; },
  "--prefix": (flags, value) => { flags.prefix = value; },
  "--kind": (flags, value) => { flags.kind = value; },
  "--source": (flags, value) => { flags.source = value; },
  "--css": (flags, value) => { flags.css = value; },
  "--ts": (flags, value) => { flags.ts = value; },
  "--owner": (flags, value) => { flags.owner = value; },
  "--handle": (flags, value) => { flags.handle = value; },
  "--priority": (flags, value) => { flags.priority = value; },
  "--goal": (flags, value) => { flags.goal = value; },
  "--slug": (flags, value) => { flags.slug = value; },
  "--needs": (flags, value) => { flags.needs = value; },
  "--context": (flags, value) => { flags.context = value; },
  "--notes": (flags, value) => { flags.notes = value; },
  "--prior-review": (flags, value) => { flags.priorReview = value; },
  "--before-comment-id": (flags, value) => { flags.beforeCommentId = value; },
  "--comment-id": (flags, value) => { flags.commentId = value; },
  "--body-file": (flags, value) => { flags.bodyFile = value; },
  "--pr-body-file": (flags, value) => { flags.prBodyFile = value; },
  "--selection": (flags, value) => { flags.selection = value; },
  "--title": (flags, value) => { flags.title = value; },
  "--edition": (flags, value) => { flags.edition = value; },
  "--publisher": (flags, value) => { flags.publisher = value; },
  "--year": (flags, value) => { flags.year = value; },
  "--language": (flags, value) => { flags.language = value; },
  "--rules-path": (flags, value) => { flags.rulesPath = value; },
  "--out": (flags, value) => { flags.out = value; },
};

const booleanOptions: Record<string, (flags: Flags) => void> = {
  "--check": (flags) => { flags.check = true; },
  "--all": (flags) => { flags.all = true; },
  "--offline": (flags) => { flags.offline = true; },
  "--print": (flags) => { flags.print = true; },
  "--dry-run": (flags) => { flags.dryRun = true; },
  "--no-browser": (flags) => { flags.openBrowser = false; },
  "--no-provision": (flags) => { flags.provision = false; },
  "--no-waitlist": (flags) => { flags.waitlist = false; },
  "--no-hq": (flags) => { flags.hq = false; },
  "--json": (flags) => { flags.json = true; },
  "--full": (flags) => { flags.full = true; },
  "--dispatch": (flags) => { flags.dispatch = true; },
};

export function parseArgs(argv: string[]): Flags {
  const flags: Flags = {
    dir: "hq/product",
    base: "origin/main",
    check: false,
    dryRun: false,
    all: false,
    offline: false,
    full: false,
    json: false,
    dispatch: false,
    print: false,
    openBrowser: true,
    provision: true,
    waitlist: true,
    hq: true,
    positional: [],
    authors: [],
    isbns: [],
  };

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]!;
    const stringOption = Object.hasOwn(stringOptions, arg) ? stringOptions[arg] : undefined;
    if (stringOption) {
      stringOption(flags, argv[++i]);
      continue;
    }
    const booleanOption = Object.hasOwn(booleanOptions, arg) ? booleanOptions[arg] : undefined;
    if (booleanOption) {
      booleanOption(flags);
      continue;
    }
    switch (arg) {
      case "--dir":
        flags.dir = argv[++i] ?? flags.dir;
        break;
      case "--base":
        flags.base = argv[++i] ?? flags.base;
        break;
      case "--issue":
        flags.issue = argv[++i] ?? "";
        break;
      case "--ceiling": {
        const n = Number(argv[++i]);
        if (Number.isInteger(n) && n > 0) flags.ceiling = n;
        break;
      }
      case "--author": {
        const author = argv[++i];
        if (author) flags.authors.push(author);
        break;
      }
      case "--isbn":
        if (argv[i + 1]) flags.isbns.push(argv[++i]!);
        break;
      default:
        flags.positional.push(arg);
    }
  }
  return flags;
}

