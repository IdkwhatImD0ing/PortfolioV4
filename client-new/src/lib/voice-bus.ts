"use client";

export type VoiceCommand =
  | { type: "filter"; tag?: string; year?: number }
  | { type: "focus"; id: string }
  | { type: "open"; id: string }
  | { type: "scroll"; id: string };

type Listener = (cmd: VoiceCommand) => void;

const listeners = new Set<Listener>();

export const VoiceBus = {
  on(fn: Listener): () => void {
    listeners.add(fn);
    return () => {
      listeners.delete(fn);
    };
  },
  emit(cmd: VoiceCommand): void {
    listeners.forEach((fn) => fn(cmd));
  },
};

export function scrollToSection(id: string): void {
  if (typeof window === "undefined") return;
  const el = document.getElementById(id);
  if (!el) return;
  const y = el.getBoundingClientRect().top + window.scrollY;
  window.scrollTo({ top: y, behavior: "smooth" });
}
