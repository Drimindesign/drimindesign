export interface SentenceToken {
  text: string;
  /** True for words that fall away when the sentence is clicked. */
  falls: boolean;
}

/*
 * Parses falling-words markup: "We [don't just] make brands move." Words inside brackets
 * fall; everything else stays. Each word becomes its own token so it falls as its own body.
 */
export function parseSentence(markup: string): SentenceToken[] {
  const tokens: SentenceToken[] = [];
  for (const match of markup.matchAll(/\[([^\]]+)\]|(\S+)/g)) {
    if (match[1] !== undefined) {
      for (const word of match[1].trim().split(/\s+/)) tokens.push({ text: word, falls: true });
    } else {
      tokens.push({ text: match[2], falls: false });
    }
  }
  return tokens;
}

export function sentenceText(tokens: SentenceToken[], onlyKept = false): string {
  return tokens
    .filter((token) => !onlyKept || !token.falls)
    .map((token) => token.text)
    .join(" ");
}
