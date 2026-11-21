function unquote(value) {
  return value.startsWith('"') ? value.slice(1, -1) : value;
}

function projectTokens(text) {
  return [...text.matchAll(/\/\*[\s\S]*?\*\/|\/\/[^\r\n]*|"(?:\\[\s\S]|[^"\\])*"|<[0-9a-fA-F\s]*>|(?:[^\s"={};(),<>/]|\/(?![/*]))+|[^\s]/g)]
    .filter(([token]) => !token.startsWith("//") && !token.startsWith("/*"));
}

export function parseProject(text) {
  const tokens = projectTokens(text);
  let index = 0;
  const peek = () => tokens[index]?.[0];
  function take(expected) {
    if (peek() !== expected) throw new Error(`Invalid Xcode project: expected ${expected}`);
    return tokens[index++];
  }
  function scalar() {
    const token = tokens[index++];
    if (token?.[0] === '"' || (token?.[0] === "/" && text.startsWith("/*", token.index))) {
      throw new Error("Unterminated string or comment in the Xcode project");
    }
    if (!token || /^[={};(),<>]$/.test(token[0])) throw new Error("Invalid scalar in the Xcode project");
    return { start: token.index, raw: token[0], literal: unquote(token[0]) };
  }
  function value() {
    if (peek() === "{") return dictionary();
    if (peek() !== "(") return scalar();
    take("(");
    const list = [];
    while (peek() !== ")") {
      list.push(value());
      if (peek() === ")") break;
      take(",");
    }
    take(")");
    return list;
  }
  function dictionary() {
    take("{");
    const entries = new Map();
    while (peek() !== "}") {
      const { literal: name } = scalar();
      if (name.includes("\\")) throw new Error("Escaped assignment key in the Xcode project");
      if (entries.has(name)) throw new Error(`Duplicate ${name} key in the Xcode project`);
      take("=");
      entries.set(name, value());
      take(";");
    }
    take("}");
    return entries;
  }
  const root = dictionary();
  if (index !== tokens.length || !(root.get("objects") instanceof Map)) throw new Error("Invalid Xcode project object dictionary");
  return root;
}
