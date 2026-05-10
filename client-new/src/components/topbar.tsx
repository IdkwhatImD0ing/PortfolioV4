"use client";

import { useEffect, useState } from "react";

export function Topbar() {
  const [now, setNow] = useState<Date | null>(null);

  useEffect(() => {
    setNow(new Date());
    const t = setInterval(() => setNow(new Date()), 30000);
    return () => clearInterval(t);
  }, []);

  const time = now
    ? now.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", hour12: false })
    : "--:--";

  const pillBase =
    "px-3 py-1.5 rounded-full border border-line bg-[rgba(15,12,28,0.6)] backdrop-blur-md inline-flex items-center gap-2 whitespace-nowrap";

  return (
    <div className="fixed top-0 left-0 right-0 z-[60] py-[18px] px-7 flex justify-between items-center font-mono text-[11.5px] tracking-[0.1em] uppercase text-ink-soft pointer-events-none max-[900px]:py-3.5 max-[900px]:px-4 max-[900px]:text-[10.5px]">
      <div className="flex items-center gap-3 pointer-events-auto">
        <span className={`${pillBase} text-ink`}>Bill Zhang ✦ v2026</span>
      </div>
      <div className="flex items-center gap-3 pointer-events-auto">
        <span className={`${pillBase} max-[600px]:hidden`}>
          <span className="w-1.5 h-1.5 rounded-full bg-[#4ade80] shadow-[0_0_8px_#4ade80]" />
          Voice ready
        </span>
        <span className={`${pillBase} max-[900px]:hidden`}>SF · {time}</span>
      </div>
    </div>
  );
}
