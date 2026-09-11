import { describe, it, expect } from "vitest";
import {
  createSseParser,
  parseChatMarkdown,
  toChatMessages,
  tokenizeInline,
} from "./text-chat";

describe("toChatMessages", () => {
  it("maps agent turns to assistant and keeps order", () => {
    expect(
      toChatMessages([
        { role: "agent", content: "Hi" },
        { role: "user", content: "Hello" },
      ]),
    ).toEqual([
      { role: "assistant", content: "Hi" },
      { role: "user", content: "Hello" },
    ]);
  });

  it("drops empty turns", () => {
    expect(
      toChatMessages([
        { role: "agent", content: "  " },
        { role: "user", content: "x" },
      ]),
    ).toEqual([{ role: "user", content: "x" }]);
  });

  it("never sends UI-only notices back as assistant turns", () => {
    expect(
      toChatMessages([
        { role: "user", content: "Hi" },
        { role: "agent", content: "Couldn't reach the chat backend.", notice: true },
        { role: "user", content: "Hi again" },
      ]),
    ).toEqual([
      { role: "user", content: "Hi" },
      { role: "user", content: "Hi again" },
    ]);
  });

  it("keeps only the most recent turns, ending on the newest", () => {
    const long = Array.from({ length: 30 }, (_, i) => ({
      role: i % 2 ? ("agent" as const) : ("user" as const),
      content: `turn ${i}`,
    }));
    const out = toChatMessages(long, 4);
    expect(out.map((m) => m.content)).toEqual(["turn 26", "turn 27", "turn 28", "turn 29"]);
  });

  it("applies the cap after dropping notices, so notices don't eat the budget", () => {
    const out = toChatMessages(
      [
        { role: "user", content: "a" },
        { role: "agent", content: "b" },
        { role: "agent", content: "oops", notice: true },
        { role: "user", content: "c" },
      ],
      2,
    );
    expect(out.map((m) => m.content)).toEqual(["b", "c"]);
  });
});

describe("createSseParser", () => {
  it("parses one complete event", () => {
    const p = createSseParser();
    expect(p.push('data: {"type":"content","content":"hi"}\n\n')).toEqual([
      { type: "content", content: "hi" },
    ]);
  });

  it("parses several events in one chunk", () => {
    const p = createSseParser();
    const out = p.push(
      'data: {"type":"status","content":"Thinking..."}\n\ndata: {"type":"done"}\n\n',
    );
    expect(out.map((c) => c.type)).toEqual(["status", "done"]);
  });

  it("holds a partial event until the rest arrives", () => {
    const p = createSseParser();
    expect(p.push('data: {"type":"con')).toEqual([]);
    expect(p.push('tent","content":"a"}\n\ndata: {"ty')).toEqual([
      { type: "content", content: "a" },
    ]);
    expect(p.push('pe":"done"}\n\n')).toEqual([{ type: "done" }]);
  });

  it("accepts CRLF line endings, even split across chunks", () => {
    const p = createSseParser();
    expect(p.push('data: {"type":"done"}\r')).toEqual([]);
    expect(p.push("\n\r\n")).toEqual([{ type: "done" }]);
  });

  it("ignores comments, other fields, and malformed JSON", () => {
    const p = createSseParser();
    const out = p.push(
      ': keep-alive\n\nevent: ping\n\ndata: not json\n\ndata: {"type":"done"}\n\n',
    );
    expect(out).toEqual([{ type: "done" }]);
  });

  it("joins multi-line data per the SSE spec", () => {
    const p = createSseParser();
    expect(p.push('data: {"type":"content",\ndata: "content":"x"}\n\n')).toEqual([
      { type: "content", content: "x" },
    ]);
  });

  it("passes navigation metadata through untouched", () => {
    const p = createSseParser();
    expect(
      p.push(
        'data: {"type":"metadata","metadata":{"type":"navigation","page":"project","project_id":"dispatchai"}}\n\n',
      ),
    ).toEqual([
      {
        type: "metadata",
        metadata: { type: "navigation", page: "project", project_id: "dispatchai" },
      },
    ]);
  });
});

describe("tokenizeInline", () => {
  it("splits bold and code out of plain text", () => {
    expect(tokenizeInline("built **Dispatch AI** with `FastAPI` fast")).toEqual([
      { kind: "text", text: "built " },
      { kind: "bold", text: "Dispatch AI" },
      { kind: "text", text: " with " },
      { kind: "code", text: "FastAPI" },
      { kind: "text", text: " fast" },
    ]);
  });

  it("renders single-asterisk italics", () => {
    expect(tokenizeInline("My motto: *prepare for the worst, hope for the best.*")).toEqual([
      { kind: "text", text: "My motto: " },
      { kind: "italic", text: "prepare for the worst, hope for the best." },
    ]);
  });

  it("keeps bold and italic apart on one line", () => {
    expect(tokenizeInline("**Bold** and *soft*")).toEqual([
      { kind: "bold", text: "Bold" },
      { kind: "text", text: " and " },
      { kind: "italic", text: "soft" },
    ]);
  });

  it("leaves spaced-out asterisks literal", () => {
    expect(tokenizeInline("5 * 3 * 2")).toEqual([{ kind: "text", text: "5 * 3 * 2" }]);
    expect(tokenizeInline("*****")).toEqual([{ kind: "text", text: "*****" }]);
  });

  it("leaves unbalanced markers alone", () => {
    expect(tokenizeInline("a ** b ` c")).toEqual([{ kind: "text", text: "a ** b ` c" }]);
  });
});

describe("parseChatMarkdown", () => {
  it("recognizes bullets, headings, and drops blank lines", () => {
    const lines = parseChatMarkdown("## Projects\n\n- **SentinelAI**\n* second\n• third\nplain");
    expect(lines).toEqual([
      { bullet: false, tokens: [{ kind: "bold", text: "Projects" }] },
      { bullet: true, tokens: [{ kind: "bold", text: "SentinelAI" }] },
      { bullet: true, tokens: [{ kind: "text", text: "second" }] },
      { bullet: true, tokens: [{ kind: "text", text: "third" }] },
      { bullet: false, tokens: [{ kind: "text", text: "plain" }] },
    ]);
  });

  it("does not mistake a bold line for a bullet", () => {
    expect(parseChatMarkdown("**Bold start** rest")).toEqual([
      {
        bullet: false,
        tokens: [
          { kind: "bold", text: "Bold start" },
          { kind: "text", text: " rest" },
        ],
      },
    ]);
  });

  it("keeps numbered lists as literal text", () => {
    expect(parseChatMarkdown("1. first")).toEqual([
      { bullet: false, tokens: [{ kind: "text", text: "1. first" }] },
    ]);
  });
});
