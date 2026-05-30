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

export interface NavigationAction {
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
