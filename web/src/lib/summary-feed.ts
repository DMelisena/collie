// The summary chat's own projection: turn a pane's ordinary transcript into a rolling feed of
// summaries, one chat per agent (Captain's brief). LAZY ON PURPOSE — this reads the exact same
// `TranscriptEntry[]` the History page and the live Chat stream already read (one journal, no new
// event bus, no new storage). It adds exactly one thing those two do not have: a feed that is ALL
// summary, never raw turns.
//
// TWO KINDS OF ITEM, AND ONLY TWO:
//  - "existing": a compaction summary the agent wrote about its own history (`role: "summary"`,
//    journal/types.ts). Kept VERBATIM — the lazy rule says reuse a usable summary rather than
//    re-deriving one, and this is the one journal role that already is one.
//  - "recap": an Ahoy-style one-liner, built ONLY where a run of ordinary turns has no existing
//    summary to stand for it. It never reads tool output or the mirror — only `user`/`assistant`
//    speech, the one thing the journal already treats as content rather than noise. That is also
//    what keeps raw terminal output out of this feed: there is no raw terminal text anywhere in a
//    `TranscriptEntry`, and a recap touches speech parts only.
//
// WHAT THIS DOES NOT DO: no network, no clock, no React. Pure and total over whatever the caller
// already fetched (`fetchHistory` or the live chat window), so it is testable with plain arrays.

import type { TranscriptEntry } from "./types";

export interface SummaryChatItem {
  /** Stable across re-projections of the same entries: the anchoring entry's uuid plus a tag. */
  id: string;
  ts?: string;
  /** "existing" draws the agent's own words; "recap" draws this module's one-line stand-in. */
  kind: "existing" | "recap";
  text: string;
}

/** A recap line is a glance, not a transcript — long enough to recognise the moment, no more. */
const GIST_CHARS = 160;

/** First line, trimmed, capped — the same shape every short chrome line in this app already takes. */
function gist(text: string): string {
  const line = text.trim().split("\n")[0] ?? "";
  return line.length > GIST_CHARS ? `${line.slice(0, GIST_CHARS - 1)}…` : line;
}

/** The speech in one turn, joined — never a tool part, never a thinking part. */
function speechOf(entry: TranscriptEntry): string {
  return entry.parts
    .flatMap((p) => (p.kind === "text" && p.text.trim() ? [p.text.trim()] : []))
    .join(" ");
}

/** An existing compaction summary's own text, or null when it carries none to show. */
function existingSummaryText(entry: TranscriptEntry): string | null {
  const text = speechOf(entry);
  return text === "" ? null : text;
}

/**
 * One Ahoy-style recap over a run of ordinary turns that has no existing summary standing for it —
 * what was asked, and what came of it — or null when the run has no speech to recap at all (every
 * turn in it was empty, or every part was a tool call with nothing said).
 */
function recapOf(run: readonly TranscriptEntry[]): SummaryChatItem | null {
  const firstUser = run.find((e) => e.role === "user" && speechOf(e) !== "");
  const lastAssistant = run.toReversed().find((e) => e.role === "assistant" && speechOf(e) !== "");
  const asked = firstUser ? gist(speechOf(firstUser)) : null;
  const said = lastAssistant ? gist(speechOf(lastAssistant)) : null;
  if (asked === null && said === null) return null;
  const text = asked !== null && said !== null && asked !== said ? `${asked} → ${said}` : asked ?? said!;
  const anchor = run[run.length - 1]!;
  return { id: `${anchor.uuid}:recap`, ts: anchor.ts || undefined, kind: "recap", text };
}

/**
 * The summary chat's whole feed: every existing summary kept as itself, and one recap per gap
 * between them (or before the first / after the last) that has no summary of its own. Chronological,
 * because the entries it reads already are.
 */
export function summaryFeedOf(entries: readonly TranscriptEntry[]): SummaryChatItem[] {
  // A rewound turn is not part of this session's current branch, the same rule the live Chat
  // stream and the History page both apply to the same flag.
  const live = entries.filter((e) => e.abandoned !== true);
  const items: SummaryChatItem[] = [];
  let run: TranscriptEntry[] = [];
  const flush = () => {
    if (run.length === 0) return;
    const recap = recapOf(run);
    if (recap !== null) items.push(recap);
    run = [];
  };
  for (const entry of live) {
    if (entry.role === "summary") {
      const text = existingSummaryText(entry);
      if (text === null) continue; // nothing to show either as itself or folded into a run
      flush();
      items.push({ id: `${entry.uuid}:existing`, ts: entry.ts || undefined, kind: "existing", text });
      continue;
    }
    // "note" is machine-injected chrome, not conversation — the recap is about what was asked and
    // what happened, and a note is neither.
    if (entry.role === "user" || entry.role === "assistant") run.push(entry);
  }
  flush();
  return items;
}
