import type { PersonalFact } from "./types";

export const PORTFOLIO = {
  name: "Bill Zhang",
  tagline: "AI engineer. Builder of voice-first systems.",
  location: "San Francisco, CA",
  email: "billzhangsc@gmail.com",
  github: "https://github.com/IdkwhatImD0ing",
  linkedin: "https://www.linkedin.com/in/bill-zhang1/",
  devpost: "https://devpost.com/IdkwhatImD0ing",
} as const;

export const PERSONAL_FACTS: PersonalFact[] = [
  { icon: "✦", line: "Finished a 4-year CS degree in <b>2.5 years</b>." },
  { icon: "✦", line: "Won my first hackathon at <b>17</b>. Haven't slowed down." },
  { icon: "✦", line: "Speaks <b>Mandarin and English</b>; building agents in both." },
  { icon: "✦", line: "If I'm not coding, I'm probably <b>making music</b> or chasing good noodles." },
  { icon: "✦", line: "Plays <b>drums and piano</b> on the side." },
  { icon: "✦", line: "Believe the next billion users will <b>talk to software</b>, not click it." },
];
