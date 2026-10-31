const names = (prefix, methods) =>
  Object.freeze(methods.map((method) => `${prefix}_${method}`));

export const claudeMethods = Object.freeze([
  "inspect",
  "start",
  "view",
  "status",
  "wait",
  "answer",
  "stop",
  "override",
  "memories",
]);

export const poolMethods = Object.freeze([
  "profiles",
  "start",
  "status",
  "wait",
  "logs",
  "answer",
  "followup",
  "stop",
  "recover",
  "reconcile",
  "reattach",
]);

export const codexMethods = Object.freeze([
  "inspect",
  "start",
  "view",
  "status",
  "wait",
  "answer",
  "stop",
  "override",
  "memories",
]);

export const codexMcpToolNames = Object.freeze([
  ...names("pool", poolMethods),
  ...names("claude", claudeMethods),
]);

export const claudeMcpToolNames = names("codex", codexMethods);
