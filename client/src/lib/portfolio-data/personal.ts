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
  { icon: "✦", line: "Won my first hackathon at <b>17</b>, and <b>35</b> more since." },
  { icon: "✦", line: "Speaks <b>Mandarin and English</b>; building agents in both." },
  { icon: "✦", line: "Plays <b>drums and piano</b> when the laptop is closed." },
  { icon: "✦", line: "Will cross <b>San Francisco</b> for a good bowl of noodles." },
  { icon: "✦", line: "Would rather <b>talk to software</b> than tap through it. Hence this site." },
];
