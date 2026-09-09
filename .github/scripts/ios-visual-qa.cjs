// Trusted publisher: caller manifests and Xcode exports are data, never executable code.
const fs = require('node:fs');
const path = require('node:path');
const BRANCH = 'nightly-ios-visual-qa';
const DIRECTORY = 'qa/nightly-ios';
const MARKER = '<!-- morpheus-ios-visual-qa -->';
const escape = value => String(value).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

function validateRun(run, repository, workflow) {
  if (run.head_repository?.full_name !== repository || run.repository?.full_name !== repository ||
      run.head_branch !== 'main' || !['schedule', 'workflow_dispatch'].includes(run.event) ||
      run.path !== `.github/workflows/${workflow}` || run.status !== 'completed' ||
      !/^[a-f0-9]{40}$/.test(run.head_sha)) throw new Error('Only completed, same-repository main nightly runs may publish');
}
function validateInventory(inventory) {
  if (inventory.version !== 1 || !Array.isArray(inventory.screens) || !inventory.screens.length || inventory.screens.length > 100)
    throw new Error('Expected version 1 inventory with 1–100 screens');
  const ids = new Set();
  for (const screen of inventory.screens) {
    if (!/^[a-z0-9][a-z0-9-]{0,79}$/.test(screen.id) || ids.has(screen.id) ||
        typeof screen.title !== 'string' || !screen.title.length || screen.title.length > 120 ||
        typeof screen.attachment !== 'string' || !/^[a-zA-Z0-9][a-zA-Z0-9-]{0,119}$/.test(screen.attachment))
      throw new Error('Invalid or duplicate screen inventory entry');
    ids.add(screen.id);
  }
  return inventory;
}
function collectScreens(inventory, directory) {
  validateInventory(inventory);
  const manifestPath = path.join(directory, 'manifest.json');
  const groups = fs.existsSync(manifestPath) ? JSON.parse(fs.readFileSync(manifestPath, 'utf8')) : [];
  if (!Array.isArray(groups)) throw new Error('Invalid Xcode attachment manifest');
  const attachments = groups.flatMap(group => group.attachments ?? []);
  return inventory.screens.map(screen => {
    // Xcode appends an ordinal and UUID to the explicitly named XCTAttachment.
    const matches = attachments.filter(a => a.suggestedHumanReadableName?.startsWith(`${screen.attachment}_`) &&
      !a.isAssociatedWithFailure).sort((a, b) => (b.timestamp ?? 0) - (a.timestamp ?? 0));
    const attachment = matches[0];
    if (!attachment) return {...screen, missing: true};
    const name = attachment.exportedFileName;
    if (typeof name !== 'string' || !/^[a-zA-Z0-9-]+\.png$/.test(name)) throw new Error('Unsafe attachment filename');
    const file = path.join(directory, name);
    if (fs.lstatSync(file).isSymbolicLink()) throw new Error('Symlink attachment refused');
    const bytes = fs.readFileSync(file);
    if (bytes.length > 10 * 1024 * 1024 || bytes.length < 24 ||
        !bytes.subarray(0, 8).equals(Buffer.from([137,80,78,71,13,10,26,10])) ||
        bytes.readUInt32BE(16) < 300 || bytes.readUInt32BE(20) < 500) throw new Error('Expected bounded full-screen PNG');
    return {...screen, bytes, device: attachment.deviceName};
  });
}
function gallery(screens, repository, sha, run) {
  const missing = screens.filter(s => s.missing);
  const header = `${MARKER}\n<!-- run:${run.id}:${run.run_attempt} number:${run.run_number} -->\n` +
    `# Nightly iOS visual QA\n\n**Work in progress — review only; do not merge.**\n\n` +
    `[Nightly run ${run.run_number}, attempt ${run.run_attempt}](https://github.com/${repository}/actions/runs/${run.id}) · ` +
    `[Source ${run.head_sha.slice(0, 7)}](https://github.com/${repository}/commit/${run.head_sha}) · ${run.updated_at}\n\n` +
    `Captured **${screens.length - missing.length}/${screens.length}** screens. Nightly result: **${run.conclusion}**. ` +
    `Synthetic simulator fixtures; optional modals and external websites are excluded.\n\n` +
    (missing.length ? `**Incomplete capture:** ${missing.map(s => escape(s.title)).join(', ')}. Missing images are never carried forward from an older run.\n\n` : '') +
    `This gallery is replaced each night; discussion stays on this PR. Image links identify this capture's immutable commit.\n\n`;
  const cells = screens.map(s => {
    const url = `https://github.com/${repository}/blob/${sha}/${DIRECTORY}/${s.id}.png?raw=true`;
    return `<td width="50%"><strong>${escape(s.title)}</strong><br>${s.missing ? '<em>Not captured in this run</em>' : `<a href="${url}"><img src="${url}" alt="${escape(s.title)}" width="360"></a><br><sub>${escape(s.device ?? 'iOS simulator')}</sub>`}</td>`;
  });
  const rows = [];
  for (let i = 0; i < cells.length; i += 2) rows.push(`<tr>${cells[i]}${cells[i + 1] ?? '<td></td>'}</tr>`);
  return header + `<table>\n${rows.join('\n')}\n</table>\n`;
}
async function prepare({github, context, core, runId, workflow, manifestPath, outputDirectory}) {
  const params = context.repo;
  const repository = `${params.owner}/${params.repo}`;
  const {data: run} = await github.rest.actions.getWorkflowRun({...params, run_id: Number(runId)});
  validateRun(run, repository, workflow);
  if (!/^qa\/[a-zA-Z0-9/_.-]+\.json$/.test(manifestPath) || manifestPath.includes('..')) throw new Error('Invalid manifest path');
  const {data: content} = await github.rest.repos.getContent({...params, path: manifestPath, ref: run.head_sha});
  const inventory = validateInventory(JSON.parse(Buffer.from(content.content, 'base64').toString('utf8')));
  fs.mkdirSync(outputDirectory, {recursive:true});
  fs.writeFileSync(path.join(outputDirectory, 'source.json'), JSON.stringify({run, inventory}));
  const artifacts = await github.paginate(github.rest.actions.listWorkflowRunArtifacts, {...params, run_id: run.id, per_page:100});
  const artifact = artifacts.find(a => a.name === `ios-screenshots-${run.id}-${run.run_attempt}` && !a.expired);
  core.setOutput('artifact-id', artifact?.id ?? '');
}
async function publish({github, context, core, outputDirectory, attachmentDirectory}) {
  const params = context.repo;
  const repository = `${params.owner}/${params.repo}`;
  const {run, inventory} = JSON.parse(fs.readFileSync(path.join(outputDirectory, 'source.json'), 'utf8'));
  const prs = await github.paginate(github.rest.pulls.list, {...params, state:'open', head:`${params.owner}:${BRANCH}`, base:'main', per_page:100});
  const pr = prs[0];
  if (pr && !pr.body?.includes(MARKER)) throw new Error('Refusing to overwrite an unrelated PR');
  const previous = pr?.body?.match(/<!-- run:(\d+):(\d+) number:(\d+) -->/);
  if (previous && (Number(previous[3]) > run.run_number ||
      (Number(previous[3]) === run.run_number && Number(previous[2]) > run.run_attempt))) {
    core.notice('A newer nightly capture is already published'); return;
  }
  // Restore review-only state before changing the branch, avoiding an auto-merge race.
  if (pr) {
    if (!pr.draft) await github.graphql('mutation($id:ID!){convertPullRequestToDraft(input:{pullRequestId:$id}){pullRequest{id}}}', {id:pr.node_id});
    if (pr.auto_merge) await github.graphql('mutation($id:ID!){disablePullRequestAutoMerge(input:{pullRequestId:$id}){pullRequest{id}}}', {id:pr.node_id});
  }
  const screens = collectScreens(inventory, attachmentDirectory);
  const {data: base} = await github.rest.git.getRef({...params, ref:'heads/main'});
  const {data: baseCommit} = await github.rest.git.getCommit({...params, commit_sha:base.object.sha});
  // Every refresh is one commit above current main, so old screenshots never accumulate in the diff.
  const tree = [];
  for (const screen of screens.filter(s => !s.missing)) {
    const {data: blob} = await github.rest.git.createBlob({...params, content:screen.bytes.toString('base64'), encoding:'base64'});
    tree.push({path:`${DIRECTORY}/${screen.id}.png`, mode:'100644', type:'blob', sha:blob.sha});
  }
  tree.push({path:`${DIRECTORY}/capture.json`, mode:'100644', type:'blob', content:JSON.stringify({run:run.id, attempt:run.run_attempt, source:run.head_sha, screens:screens.map(({bytes,...s}) => s)}, null, 2)});
  const {data: createdTree} = await github.rest.git.createTree({...params, base_tree:baseCommit.tree.sha, tree});
  const {data: commit} = await github.rest.git.createCommit({...params, tree:createdTree.sha, parents:[base.object.sha],
    message:`Refresh nightly iOS visual QA (${run.id}/${run.run_attempt})\n\nCo-authored-by: Codex <codex@cpheinrich.com>`});
  let ref;
  try { ref = (await github.rest.git.getRef({...params, ref:`heads/${BRANCH}`})).data; }
  catch (error) { if (error.status !== 404) throw error; }
  if (ref) {
    // A closed bot PR can be recreated, but an unrelated branch must never be overwritten.
    const {data: oldCommit} = await github.rest.git.getCommit({...params, commit_sha:ref.object.sha});
    if (!oldCommit.message.startsWith('Refresh nightly iOS visual QA (')) throw new Error('Unrelated branch refused');
    await github.rest.git.updateRef({...params, ref:`heads/${BRANCH}`, sha:commit.sha, force:true});
  } else await github.rest.git.createRef({...params, ref:`refs/heads/${BRANCH}`, sha:commit.sha});
  const body = gallery(screens, repository, commit.sha, run);
  let result;
  if (pr) {
    result = await github.rest.pulls.update({...params, pull_number:pr.number, title:'WIP: Nightly iOS visual QA', body});
  } else result = await github.rest.pulls.create({...params, head:BRANCH, base:'main', draft:true, title:'WIP: Nightly iOS visual QA', body});
  core.setOutput('pull-request-url', result.data.html_url);
  await core.summary.addLink('Nightly visual QA', result.data.html_url).addRaw(` — ${screens.filter(s => !s.missing).length}/${screens.length} screens`).write();
}
module.exports = {validateRun, validateInventory, collectScreens, gallery, prepare, publish};
