import type { Hackathon } from "./types";

// 36 wins, ordered most impressive → least (grand prizes / flagship products
// first, early small wins last). That order IS the marquee split: the first 18
// feed the top row, the last 18 the bottom row — no hackathon repeats across
// rows. `year` is omitted only where the event date isn't confirmed (Tank).
export const HACKATHONS: Hackathon[] = [
  // Top row — flagship + grand-prize wins.
  { name: "Berkeley AI Hackathon", year: 2024, project: "DispatchAI", prize: "Grand Prize · $25k" },
  { name: "HackUTD", year: 2024, project: "TalkTuahBank", prize: "Grand Prize + Goldman Sachs" },
  { name: "HackDavis", year: 2025, project: "SentinelAI", prize: "Best AI/ML Hack" },
  { name: "VTHacks", year: 2024, project: "linguify", prize: "Best Startup Hack" },
  { name: "YaleHacks", year: 2024, project: "Tidbits", prize: "1st Place" },
  { name: "LAHacks", year: 2024, project: "AdaptED", prize: "Google Challenge" },
  { name: "AIATL", year: 2023, project: "WebWeaver", prize: "Most Innovative Startup" },
  { name: "AIATL", year: 2024, project: "SoundSearch", prize: "NLX Overall" },
  { name: "HackMerced", year: 2025, project: "Vocalyze", prize: "Letta AI + Finance" },
  { name: "SpartaHacks", year: 2025, project: "Team Food Tactics", prize: "Sustainability" },
  { name: "CruzHacks", year: 2025, project: "SlugMeditate", prize: "Niantic WebXR" },
  { name: "SoCalTechWeek", year: 2024, project: "SplatNFT", prize: "Solana University" },
  { name: "HackMerced", year: 2024, project: "PyPointer", prize: "Letta + Finance" },
  { name: "DiamondHacks", year: 2024, project: "ABSeas", prize: "Captain's Classroom" },
  { name: "IrvineHacks", year: 2024, project: "XPlore", prize: "Best Travel Hack" },
  { name: "HackDearborn", year: 2024, project: "SwarmAID", prize: "2nd Place" },
  { name: "Uncommon Hacks", year: 2024, project: "Mad Lyrics", prize: "Programmatic Art" },
  { name: "HackDavis", year: 2024, project: "Doggo AI", prize: "Best Intel Dev Cloud" },
  // Bottom row — earlier / smaller wins.
  { name: "QWER Hacks", year: 2024, project: "Talking Terry", prize: "Best Google Cloud" },
  { name: "CruzHacks", year: 2023, project: "SlugLoop", prize: "MLH GitHub" },
  { name: "CruzHacks", year: 2022, project: "Covinet", prize: "QB3 @ UCSC" },
  { name: "SBHacks", year: 2023, project: "GitPT", prize: "Student Life Hack" },
  { name: "HackDavis", year: 2023, project: "IntelliConverse", prize: "Best MongoDB Atlas" },
  { name: "CitrusHacks", year: 2023, project: "MonkeySign", prize: "New Frontiers" },
  { name: "ACMHacks", year: 2023, project: "Assistance", prize: "Best Global Solution" },
  { name: "Hackrithmitic", year: 2023, project: "PaddyPlantPrognosis", prize: "Best Data Science" },
  { name: "AI Hacks", year: 2022, project: "Progno D", prize: "1st Overall" },
  { name: "WildHacks", year: 2022, project: "Wonder", prize: "2nd Overall" },
  { name: "Hacks for Hackers", year: 2023, project: "Architect", prize: "3rd Overall" },
  { name: "Opportunity Hacks", year: 2022, project: "Volunteer Hub", prize: "3rd Place" },
  { name: "Web3Apps", year: 2023, project: "Fundraiser", prize: "Microsoft Cloud + Circle" },
  { name: "Planet Unity", year: 2023, project: "Sink or Swim", prize: "Top 10" },
  { name: "GraceHacks", year: 2022, project: "Pool Party", prize: "Best Mobile" },
  { name: "PeddieHacks", year: 2022, project: "Remote Trainer", prize: "Innovation Prize (HS)" },
  { name: "Funathon", year: 2022, project: "Tetris Duels", prize: "Participation Prize" },
  { name: "FullyHacks", year: 2024, project: "Tank", prize: "1st Place" },
];
