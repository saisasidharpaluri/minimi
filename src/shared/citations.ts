import type { Citation } from "../../server/store.js";

export function addInlineCitations(text: string, citations: Citation[]): string {
  const markers = citations
    .map((citation, index) => ({ citation, index, position: citation.endIndex }))
    .filter((item): item is { citation: Citation; index: number; position: number } => Number.isInteger(item.position) && item.position! > 0 && item.position! <= text.length)
    .sort((left, right) => left.position - right.position);
  let cursor = 0;
  let result = "";
  for (const marker of markers) {
    if (marker.position <= cursor) continue;
    result += text.slice(cursor, marker.position);
    const safeUrl = encodeURI(marker.citation.url).replace(/[()]/g, (char) => char === "(" ? "%28" : "%29");
    result += ` [${marker.index + 1}](${safeUrl})`;
    cursor = marker.position;
  }
  return result + text.slice(cursor);
}
