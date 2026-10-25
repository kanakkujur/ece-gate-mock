export function questionIdentity(q) {
  const stem=String(q.question||'').normalize('NFKC').toLowerCase()
    .split(/\b(?:the\s+)?options\s*(?:are\b|:)/)[0]
    .replace(/[−–]/g,'-').replace(/[^\p{L}\p{N}.-]/gu,'');
  return `${stem}|${JSON.stringify(q.diagram||null)}`;
}
