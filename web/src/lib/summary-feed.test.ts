import { summaryFeedOf } from "./summary-feed";
import type { TranscriptEntry } from "./types";

// Summary projection and chat ordering — the one behaviour this slice adds over the existing
// journal stream. The load-bearing rules: an existing compaction summary is kept verbatim, a run of
// ordinary turns with no summary gets exactly one Ahoy-style recap, raw tool output never reaches a
// recap, and the whole feed stays chronological.

const entry = (over: Partial<TranscriptEntry> = {}): TranscriptEntry => ({
  uuid: "u1",
  ts: "2026-09-30T08:00:00.000Z",
  role: "assistant",
  parts: [],
  ...over,
});

describe("summaryFeedOf", () => {
  it("keeps an existing compaction summary verbatim and in order", () => {
    const entries: TranscriptEntry[] = [
      entry({ uuid: "u1", role: "user", parts: [{ kind: "text", text: "build the thing" }] }),
      entry({
        uuid: "u2",
        role: "summary",
        ts: "2026-09-30T08:05:00.000Z",
        parts: [{ kind: "text", text: "the agent's own recap" }],
      }),
    ];
    const feed = summaryFeedOf(entries);
    expect(feed).toHaveLength(2);
    expect(feed[0]).toMatchObject({ kind: "recap" });
    expect(feed[1]).toEqual({
      id: "u2:existing",
      ts: "2026-09-30T08:05:00.000Z",
      kind: "existing",
      text: "the agent's own recap",
    });
  });

  it("builds one Ahoy-style recap for a run with no summary, from asked → said", () => {
    const entries: TranscriptEntry[] = [
      entry({ uuid: "u1", role: "user", parts: [{ kind: "text", text: "fix the bug" }] }),
      entry({ uuid: "u2", role: "assistant", parts: [{ kind: "tool", name: "Bash", summary: "run tests" }] }),
      entry({ uuid: "u3", role: "assistant", ts: "2026-09-30T08:10:00.000Z", parts: [{ kind: "text", text: "fixed it, tests pass" }] }),
    ];
    const feed = summaryFeedOf(entries);
    expect(feed).toEqual([
      { id: "u3:recap", ts: "2026-09-30T08:10:00.000Z", kind: "recap", text: "fix the bug → fixed it, tests pass" },
    ]);
  });

  it("never reads tool output or thinking text into a recap", () => {
    const entries: TranscriptEntry[] = [
      entry({
        uuid: "u1",
        role: "assistant",
        parts: [
          { kind: "thinking", text: "secret reasoning" },
          { kind: "tool", name: "Read", summary: "src/app.ts", result: { text: "file contents nobody should see here" } },
        ],
      }),
    ];
    expect(summaryFeedOf(entries)).toEqual([]);
  });

  it("drops an entry the agent rewound past, same as the live Chat stream", () => {
    const entries: TranscriptEntry[] = [
      entry({ uuid: "u1", role: "user", abandoned: true, parts: [{ kind: "text", text: "undone" }] }),
      entry({ uuid: "u2", role: "assistant", parts: [{ kind: "text", text: "kept" }] }),
    ];
    expect(summaryFeedOf(entries)).toEqual([
      { id: "u2:recap", ts: "2026-09-30T08:00:00.000Z", kind: "recap", text: "kept" },
    ]);
  });

  it("produces one recap per gap between two existing summaries, in order", () => {
    const entries: TranscriptEntry[] = [
      entry({ uuid: "u1", role: "user", parts: [{ kind: "text", text: "first ask" }] }),
      entry({ uuid: "u2", role: "summary", ts: "2026-09-30T08:05:00.000Z", parts: [{ kind: "text", text: "recap one" }] }),
      entry({ uuid: "u3", role: "user", parts: [{ kind: "text", text: "second ask" }] }),
      entry({ uuid: "u4", role: "summary", ts: "2026-09-30T08:10:00.000Z", parts: [{ kind: "text", text: "recap two" }] }),
    ];
    const feed = summaryFeedOf(entries);
    expect(feed.map((i) => i.kind)).toEqual(["recap", "existing", "recap", "existing"]);
    expect(feed.map((i) => i.text)).toEqual(["first ask", "recap one", "second ask", "recap two"]);
  });

  it("skips a summary turn with no text rather than drawing an empty block", () => {
    const entries: TranscriptEntry[] = [entry({ uuid: "u1", role: "summary", parts: [] })];
    expect(summaryFeedOf(entries)).toEqual([]);
  });

  it("is empty for a transcript with no speech at all", () => {
    expect(summaryFeedOf([])).toEqual([]);
  });
});
