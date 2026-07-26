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

/** True when the user has asked the OS for less motion. Every animated scroll
 *  in the app should gate on this — the global reduced-motion CSS block only
 *  clamps animation/transition durations, which does nothing for scrolling. */
export function prefersReducedMotion(): boolean {
  if (typeof window === "undefined") return false;
  return window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
}

export function scrollToSection(id: string): void {
  if (typeof window === "undefined") return;
  const el = document.getElementById(id);
  if (!el) return;
  const y = el.getBoundingClientRect().top + window.scrollY;
  // "instant" — not "auto". Per CSSOM-View "auto" defers to the computed
  // `scroll-behavior`, which globals.css sets to `smooth` on <html>, so "auto"
  // would still animate and this branch would silently do nothing.
  window.scrollTo({ top: y, behavior: prefersReducedMotion() ? "instant" : "smooth" });
}

/** Navigation metadata shape emitted by the server via Retell's metadata
 *  event. Each `page` value here MUST be in PAGE_TO_SECTION below. */
export interface NavigationMeta {
  type: string;
  page?:
    | "landing"
    | "education"
    | "project"
    | "personal"
    | "resume"
    | "hackathon"
    | "architecture";
  project_id?: string;
}

/** Server `page` value → DOM section id on the long-scroll layout. */
export const PAGE_TO_SECTION: Record<NonNullable<NavigationMeta["page"]>, string> = {
  landing: "hero",
  personal: "personal",
  education: "education",
  project: "projects",
  resume: "resume",
  hackathon: "hackathons",
  architecture: "architecture",
};

interface NavigationAction {
  command: VoiceCommand;
  scrollTo: string;
}

/** Convert a server-side navigation metadata payload into the VoiceBus
 *  command + section id the page should scroll to. Returns null when the
 *  payload isn't a navigation metadata or the page is unknown. Pure — no
 *  side effects, safe to unit-test. */
export function metaToNavigationAction(
  meta: NavigationMeta | null | undefined,
): NavigationAction | null {
  if (!meta || meta.type !== "navigation" || !meta.page) return null;

  if (meta.page === "project" && meta.project_id) {
    return {
      command: { type: "open", id: meta.project_id },
      scrollTo: "projects",
    };
  }

  const section = PAGE_TO_SECTION[meta.page];
  if (!section) return null;

  return {
    command: { type: "scroll", id: section },
    scrollTo: section,
  };
}
