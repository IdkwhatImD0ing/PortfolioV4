"use client";

import { useEffect } from "react";

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Surface the crash in the console for debugging; Vercel also captures it.
    console.error("Caught by app error boundary:", error);
  }, [error]);

  return (
    <div
      style={{ backgroundColor: "#07060d" }}
      className="flex min-h-screen flex-col items-center justify-center gap-6 px-6 text-center"
    >
      <div className="space-y-3">
        <h2 className="text-2xl font-semibold text-white">Something went wrong</h2>
        <p className="max-w-md text-sm text-white/60">
          An unexpected error occurred while rendering the page. Try again, and
          if it keeps happening, reload.
        </p>
      </div>
      <div className="flex items-center gap-3">
        <button
          onClick={reset}
          style={{ backgroundColor: "#A259FF" }}
          className="rounded-full px-5 py-2 text-sm font-medium text-white transition-opacity hover:opacity-90"
        >
          Try again
        </button>
        <button
          onClick={() => window.location.reload()}
          className="rounded-full border border-white/15 px-5 py-2 text-sm font-medium text-white/80 transition-colors hover:bg-white/5"
        >
          Reload page
        </button>
      </div>
    </div>
  );
}
