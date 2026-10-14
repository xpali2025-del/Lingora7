// Strip front-matter, data tables, blockquotes (boilerplate/disclosures) and {{placeholders}}
// so the gate measures authored paragraphs only.
export function authoredText(md) {
  return md.replace(/^---[\s\S]*?---/, '')
    .split('\n').filter(l => !l.trim().startsWith('|') && !l.trim().startsWith('>'))
    .join('\n').replace(/\{\{[^}]+\}\}/g, ' ').replace(/\[VERIFY[^\]]*\]/g, ' ')
    .replace(/[#*_`\[\]()]/g, ' ');
}
export function frontMatter(md) {
  const m = md.match(/^---\n([\s\S]*?)\n---/); const out = {};
  if (!m) return out;
  for (const line of m[1].split('\n')) { const i = line.indexOf(':'); if (i > 0) out[line.slice(0, i).trim()] = line.slice(i + 1).trim(); }
  return out;
}
