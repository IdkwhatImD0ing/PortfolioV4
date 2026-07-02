/** Minimal, dependency-free JS/TS syntax highlighter for the small static code
 * snippet in the architecture section. Not a general-purpose tokenizer — just
 * enough rules to color this site's example on-theme. Tokens carry Tailwind
 * classes built from the site palette (see globals.css). */

export interface CodeToken {
  text: string;
  /** Tailwind text-color classes; empty string = inherit the <pre> color. */
  cls: string;
}

// Ordered rules — comments and strings must win before keywords/identifiers.
// Each pattern is anchored at the start of the remaining input.
const RULES: ReadonlyArray<readonly [RegExp, string]> = [
  [/^\/\/[^\n]*/, "text-muted italic"], // line comment
  [/^\/\*[\s\S]*?\*\//, "text-muted italic"], // block comment
  [/^"(?:[^"\\]|\\.)*"/, "text-cyan"], // double-quoted string
  [/^'(?:[^'\\]|\\.)*'/, "text-cyan"], // single-quoted string
  [/^`(?:[^`\\]|\\.)*`/, "text-cyan"], // template string
  [/^\d+(?:\.\d+)?/, "text-cyan"], // number
  [/^=>/, "text-magenta"], // arrow
  [
    /^(?:const|let|var|function|return|if|else|for|while|new|import|from|export|default|await|async|type|interface|class|extends|typeof)\b/,
    "text-magenta",
  ], // keyword
  [/^[A-Za-z_$][\w$]*(?=\s*\()/, "text-accent"], // function/method call
  [/^[A-Z][\w$]*/, "text-primary"], // PascalCase (e.g. VoiceBus)
  [/^[A-Za-z_$][\w$]*/, "text-ink"], // identifier
  [/^\s+/, ""], // whitespace
  [/^[\s\S]/, "text-ink-soft"], // punctuation / anything else
];

export function highlightJs(code: string): CodeToken[] {
  const tokens: CodeToken[] = [];
  let rest = code;
  while (rest.length > 0) {
    let matched = false;
    for (const [re, cls] of RULES) {
      const m = re.exec(rest);
      if (m && m[0].length > 0) {
        tokens.push({ text: m[0], cls });
        rest = rest.slice(m[0].length);
        matched = true;
        break;
      }
    }
    // The final rule matches any single char, so this is just a safety net.
    if (!matched) {
      tokens.push({ text: rest[0], cls: "" });
      rest = rest.slice(1);
    }
  }
  return tokens;
}
