// Strict-enough XML well-formedness check (XML 1.0 §2.1/§3.1): one root,
// balanced and properly nested tags, quoted unique attributes, and no bare
// "<" or "&" outside markup. Returns a list of problems (empty = well-formed).
export function xmlProblems(xml: string): string[] {
  const problems: string[] = [];
  const stack: string[] = [];
  let roots = 0;
  const body = xml.replace(/^<\?xml[^?]*\?>\s*/, "");
  const token =
    /<!--[\s\S]*?-->|<!\[CDATA\[[\s\S]*?\]\]>|<\/([A-Za-z_][\w:.-]*)\s*>|<([A-Za-z_][\w:.-]*)((?:\s+[^\s=/>]+\s*=\s*(?:"[^"<]*"|'[^'<]*'))*)\s*(\/?)>|([^<]+)|(<)/g;
  for (const match of body.matchAll(token)) {
    const [, close, open, attrs, selfClosing, text, stray] = match;
    if (stray) {
      problems.push(`malformed markup at offset ${match.index}`);
      continue;
    }
    if (text !== undefined) {
      if (stack.length === 0 && text.trim())
        problems.push("text outside the root");
      if (/&(?!(?:amp|lt|gt|quot|apos|#\d+|#x[0-9a-f]+);)/i.test(text)) {
        problems.push(`unescaped & in text: ${text.slice(0, 40)}`);
      }
      continue;
    }
    if (open) {
      if (stack.length === 0) roots++;
      const names = new Set<string>();
      for (const attr of (attrs ?? "").matchAll(
        /([^\s=]+)\s*=\s*("([^"]*)"|'([^']*)')/g
      )) {
        const name = attr[1] as string;
        if (names.has(name))
          problems.push(`duplicate attribute ${name} on <${open}>`);
        names.add(name);
        const value = attr[3] ?? attr[4] ?? "";
        if (/&(?!(?:amp|lt|gt|quot|apos|#\d+|#x[0-9a-f]+);)/i.test(value)) {
          problems.push(`unescaped & in ${name} on <${open}>`);
        }
      }
      if (!selfClosing) stack.push(open);
    } else if (close) {
      const top = stack.pop();
      if (top !== close)
        problems.push(`</${close}> closes <${top ?? "nothing"}>`);
    }
  }
  if (stack.length) problems.push(`unclosed <${stack.join("> <")}>`);
  if (roots !== 1) problems.push(`${roots} root elements`);
  return problems;
}
