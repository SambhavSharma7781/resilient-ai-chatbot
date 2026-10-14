/**
 * Models often write maths as \( ... \) and \[ ... \]. Markdown treats those backslashes as escapes,
 * so the formula shows up as plain "[ \boxed{391} ]". Rewrite them to $$ ... $$ (which remark-math
 * understands) and leave code blocks and inline code untouched.
 */
export function normalizeMath(src: string): string {
  return src
    .split(/(```[\s\S]*?```|`[^`\n]*`)/g)
    .map((part, i) =>
      i % 2 === 1
        ? part
        : part
            .replace(/\\\[([\s\S]+?)\\\]/g, (_m, body: string) => `\n\n$$\n${body.trim()}\n$$\n\n`)
            .replace(/\\\(([\s\S]+?)\\\)/g, (_m, body: string) => `$$${body.trim()}$$`)
            // Some models drop the backslashes and send a bare "[ \boxed{391} ]" paragraph.
            .replace(/(^|\n\n)\[\s+((?:(?!\n\n)[\s\S])*?\\(?:begin|boxed|frac|times|cdot|sqrt)(?:(?!\n\n)[\s\S])*?)\s+\](?=\n\n|$)/g, (_m, lead: string, body: string) => `${lead}\n$$\n${body.trim()}\n$$\n`),
    )
    .join("");
}