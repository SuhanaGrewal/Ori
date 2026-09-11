import React from "react";

// The backend deliberately embeds [1]/[2]-style citation markers in the
// prose - that's how it stays grounded to exact sources rather than
// hallucinating - but the citation chips rendered below each answer
// already show those same sources more legibly, so repeating them as
// bracket-numbers in the sentence itself just reads like a
// half-rendered footnote system. Strip them here for display only; the
// real citation data (card.citations) is untouched. The model also
// naturally emphasizes key facts with **bold** markdown, which was
// rendering as literal asterisks - turn that into real <strong> instead.
//
// Pulled out of DashboardPage.jsx (was previously an inline helper
// there) so both AskCard.jsx's top-level answer and its nested
// follow-up answers can share exactly one formatting implementation.

const LIST_ITEM_RE = /^\s*\d+[.)]\s+(.*)$/s;

function renderInline(text, keyPrefix) {
  return text.split(/(\*\*[^*]+\*\*)/g).map((part, i) =>
    part.startsWith("**") && part.endsWith("**") ? (
      <strong key={`${keyPrefix}-${i}`}>{part.slice(2, -2)}</strong>
    ) : (
      <React.Fragment key={`${keyPrefix}-${i}`}>{part}</React.Fragment>
    )
  );
}

// Real answers were rendering as one unbroken run - "1. Complete the
// form 2. Submit a deposit 3. Request your transcript" - even though
// the model separates points with real line breaks, because a plain
// <div> collapses "\n" the same as any other whitespace, same as any
// HTML text. Splitting on the model's own line breaks first (falling
// back to splitting directly on "N. " markers for the rare case a list
// comes back with no line breaks at all) fixes it: each numbered point
// becomes its own <li>, and non-list lines get their own paragraph
// instead of running into whatever comes right after them.
function splitInlineListMarkers(text) {
  const markerRe = /(?:^|[:\s])([1-9]\d?)\.\s+(?=[A-Z(])/g;
  const matches = [];
  let m;
  while ((m = markerRe.exec(text)) !== null) {
    matches.push({ markerStart: m.index + m[0].indexOf(m[1]), contentStart: m.index + m[0].length, number: parseInt(m[1], 10) });
  }

  let bestStart = -1;
  let bestCount = 0;
  for (let i = 0; i < matches.length; i++) {
    if (matches[i].number !== 1) continue;
    let expected = 1;
    let j = i;
    while (j < matches.length && matches[j].number === expected) {
      expected += 1;
      j += 1;
    }
    if (j - i > bestCount) {
      bestCount = j - i;
      bestStart = i;
    }
  }
  // require at least items 1 and 2 in sequence - a single stray "N. "
  // (e.g. an actual date fragment) never qualifies on its own.
  if (bestCount < 2) return [text];

  const list = matches.slice(bestStart, bestStart + bestCount);
  const segments = [];
  const pre = text.slice(0, list[0].markerStart).trim();
  if (pre) segments.push(pre);
  for (let i = 0; i < list.length; i++) {
    const end = i + 1 < list.length ? list[i + 1].markerStart : text.length;
    segments.push(`${i + 1}. ${text.slice(list[i].contentStart, end).trim()}`);
  }
  return segments;
}

export function formatAnswerText(text) {
  if (!text) return text;
  const withoutCitations = text.replace(/\s?(\[\d+\])+/g, "");

  const rawLines = withoutCitations.split(/\n+/).map((line) => line.trim()).filter(Boolean);
  const lines = rawLines.length > 1 ? rawLines : splitInlineListMarkers(withoutCitations);

  const blocks = [];
  let currentList = null;
  for (const line of lines) {
    const match = line.match(LIST_ITEM_RE);
    if (match) {
      if (!currentList) {
        currentList = [];
        blocks.push({ type: "list", items: currentList });
      }
      currentList.push(match[1].trim());
    } else {
      currentList = null;
      blocks.push({ type: "text", content: line });
    }
  }

  // the common case - a single plain sentence/paragraph, no list at all
  // - renders exactly as before, no extra wrapper div.
  if (blocks.length === 1 && blocks[0].type === "text") {
    return renderInline(blocks[0].content, "0");
  }

  return blocks.map((block, i) =>
    block.type === "list" ? (
      <ol key={i} style={{ margin: "6px 0", paddingLeft: 20 }}>
        {block.items.map((item, j) => (
          <li key={j} style={{ marginBottom: 4 }}>{renderInline(item, `${i}-${j}`)}</li>
        ))}
      </ol>
    ) : (
      <div key={i} style={{ marginBottom: i < blocks.length - 1 ? 8 : 0 }}>
        {renderInline(block.content, `${i}`)}
      </div>
    )
  );
}
