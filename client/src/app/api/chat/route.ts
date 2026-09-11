// app/api/chat/route.ts

import { NextRequest, NextResponse } from "next/server";
import { resolveApiBase } from "@/lib/backend";

// Same-origin proxy for the backend's text chat stream (POST /chat, Server-Sent
// Events). The browser can't call the backend directly: its CORS only allows
// localhost:3000 and *.art3m1s.me, so Vercel previews and any other dev port
// would be blocked. Server to server there is no CORS, and the response body
// is piped through untouched so tokens still stream.

// A reply with tool calls can take tens of seconds; don't let a short default
// function timeout cut the stream off mid-answer.
export const maxDuration = 60;

export async function POST(request: NextRequest) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const messages = (body as { messages?: unknown } | null)?.messages;
  if (!Array.isArray(messages) || messages.length === 0) {
    return NextResponse.json({ error: "messages is required" }, { status: 400 });
  }

  try {
    const base = await resolveApiBase();
    const upstream = await fetch(`${base}/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ messages }),
      cache: "no-store",
      // Stop the backend's work when the visitor closes the panel or the
      // client gives up waiting.
      signal: request.signal,
    });

    if (!upstream.ok || !upstream.body) {
      console.error("Chat backend error:", upstream.status);
      return NextResponse.json({ error: "Chat backend error" }, { status: 502 });
    }

    return new NextResponse(upstream.body, {
      status: 200,
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache, no-transform",
        "X-Accel-Buffering": "no",
      },
    });
  } catch (error: unknown) {
    console.error(
      "Chat proxy failed:",
      error instanceof Error ? error.message : error,
    );
    return NextResponse.json({ error: "Chat backend unreachable" }, { status: 502 });
  }
}
