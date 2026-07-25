"use client";

import { useEffect, useState } from "react";

export function Topbar() {
  // Starts as a placeholder so the server render and the first client render
  // agree; the real clock lands after mount.
  const [time, setTime] = useState("--:--");

  useEffect(() => {
    // Format straight in the target zone. Round-tripping through
    // `new Date(date.toLocaleString(...))` re-parses a localized string, which
    // is engine- and locale-dependent and can yield an Invalid Date.
    const update = () =>
      setTime(
        new Date().toLocaleTimeString("en-US", {
          timeZone: "America/Los_Angeles",
          hour: "2-digit",
          minute: "2-digit",
          hour12: false,
        }),
      );
    update();
    const t = setInterval(update, 30000);
    return () => clearInterval(t);
  }, []);

  const pillBase =
    "px-3 py-1.5 rounded-full border border-line bg-[rgba(15,12,28,0.6)] backdrop-blur-md inline-flex items-center gap-2 whitespace-nowrap";

  return (
    <div className="fixed top-0 left-0 right-0 z-[60] py-[18px] px-7 flex justify-between items-center font-mono text-[11.5px] tracking-[0.1em] uppercase text-ink-soft pointer-events-none max-[900px]:py-3.5 max-[900px]:px-4 max-[900px]:text-[10.5px]">
      <div className="flex items-center gap-3 pointer-events-auto">
        <span className={`${pillBase} text-ink`}>Bill Zhang</span>
      </div>
      <div className="flex items-center gap-3 pointer-events-auto">
        <span className={`${pillBase} max-[900px]:hidden`}>SF · {time}</span>
      </div>
    </div>
  );
}
