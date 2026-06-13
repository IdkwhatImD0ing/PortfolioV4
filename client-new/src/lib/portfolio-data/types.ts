export type ProjectAccent = "violet" | "magenta";

export interface Project {
  id: string;
  /** Extra IDs the project can be addressed by — e.g. the Pinecone / Devpost slug
   *  the agent uses when emitting navigation metadata. */
  aliases?: string[];
  name: string;
  year: number;
  summary: string;
  tags: string[];
  award?: string;
  accent: ProjectAccent;
  github?: string;
  demo?: string;
  videoUrl?: string;
  poster?: string;
  projectUrl?: string;
  stack?: string[];
  role?: string;
  long?: string;
}

export interface Hackathon {
  name: string;
  /** Optional — omitted when the event year isn't confirmed. */
  year?: number;
  /** What was built / shipped at the event. */
  project: string;
  /** The award won (shown on the marquee card). */
  prize: string;
}

export interface Education {
  school: string;
  full: string;
  degree: string;
  when: string;
  detail: string;
  logo: string;
}

export interface ExperienceEntry {
  when: string;
  role: string;
  where: string;
  body: string;
  badge?: string;
  /** Optional external link for the company / project. */
  link?: string;
}

export interface SkillsLineWord {
  w: string;
  tag?: boolean;
}

export interface PersonalFact {
  icon: string;
  line: string;
}
