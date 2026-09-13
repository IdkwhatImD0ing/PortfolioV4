import type { ExperienceEntry } from "./types";

export const EXPERIENCE: ExperienceEntry[] = [
  {
    when: "Jul 2026 — Now",
    role: "Software Engineer II",
    where: "Pinterest · San Francisco",
    link: "https://www.pinterest.com/",
    bullets: [
      "Building and deploying LLM agent systems for internal and partner-facing workflows: agent design, tool use, RAG integration, and production guardrails.",
      "Partnering with product and engineering teams to set the evaluation, quality, and cost bar each solution must clear before launch.",
    ],
    badge: "Now",
  },
  {
    when: "Jun 2025 — Jul 2026",
    role: "Applied AI Engineer (Forward-Deployed)",
    where: "Scale AI · San Francisco",
    link: "https://scale.com/",
    bullets: [
      "Shipped a production multi-agent system that automates denied-claim investigations, with 3 sub-agents covering 20 policy workflows.",
      "Scaled it to 300–500 weekly users and up to 20K claims a week.",
      "Led agent design for a major news publisher's AI agent, launched publicly in Nov 2025 over a 102-year archive in 13 languages.",
      "Owned the LLM-as-judge eval framework that took QA-audit accuracy from 64% → 88% and helped close a seven-figure expansion.",
      "Cut the cost of a full health-system validation run about 4× ($4.6K → ~$1.2K).",
    ],
  },
  {
    when: "Jun 2023 — Jun 2025",
    role: "AI Engineer",
    where: "RingCentral · Remote",
    link: "https://www.ringcentral.com/",
    bullets: [
      "Joined as a senior AI intern in June 2023 and converted to full-time that August.",
      "Built an LLM analytics and evaluation pipeline that grew coverage of 10,000+ weekly support chats from 1–2% to 100%.",
      "Cut processing time for that pipeline from 8 hours to 1.",
      "Added rubric-based retrieval scoring and 20 monitoring dashboards, lifting accuracy 90% → 95% and dropping human hand-offs 40% → 13%.",
    ],
  },
  {
    when: "Jun 2024 — Dec 2024",
    role: "Co-founder + CFO",
    where: "Dispatch AI · Remote",
    link: "https://dispatchai.art3m1s.me/",
    bullets: [
      "Built an emergency-response AI platform with Berkeley SkyDeck funding.",
      "Solo-engineered the low-latency voice agent and telephony behind the dispatcher demo: intent routing, emotion signals, and structured handoff to responders.",
      "Won the Grand Prize at the UC Berkeley AI Hackathon against 900+ participants.",
      "Earned $50K in total investment across two awards: the $25K Berkeley SkyDeck grand prize and a separate $25K investment from AIC.",
    ],
  },
  {
    when: "Feb 2023 — Jun 2024",
    role: "Founder",
    where: "SlugLoop · Santa Cruz",
    link: "https://www.slugloop.tech/",
    bullets: [
      "Founded and shipped UCSC's real-time bus tracker, which served 20,000+ users.",
      "Placed Global Top 10 out of 2,000+ projects in the Google Solution Challenge.",
    ],
  },
  {
    when: "Jun 2022 — Dec 2023",
    role: "CS Instructor + Teaching Assistant",
    where: "X-Camp Academy · San Jose",
    link: "https://x-camp.academy/",
    bullets: [
      "Taught Python through a challenge-based curriculum.",
      "Coached USACO students from Bronze toward Silver through algorithm practice, debugging, and contest prep.",
    ],
  },
  {
    when: "2023 — 2025+",
    role: "Hackathon Mainstay",
    where: "36 wins across the hackathon circuit",
    link: "https://www.thehackathonplaybook.dev/",
    bullets: [
      "Competed mostly during college; still enter a few events a year.",
      "Most of the projects on this page started as weekend builds.",
      "Judged LA Hacks 2026.",
      "Upcoming: confirmed as a judge for the LA Hacks AI Hackathon.",
    ],
  },
];
