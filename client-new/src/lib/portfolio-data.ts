export type ProjectAccent = "violet" | "magenta";

export interface Project {
  id: string;
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
  year: number;
  award: string;
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
}

export interface SkillsLineWord {
  w: string;
  tag?: boolean;
}

export interface PersonalFact {
  icon: string;
  line: string;
}

export const PORTFOLIO = {
  name: "Bill Zhang",
  tagline: "AI engineer. Builder of voice-first systems.",
  location: "San Francisco, CA",
  email: "billzhang0011@gmail.com",
  github: "https://github.com/IdkwhatImD0ing",
  linkedin: "https://www.linkedin.com/in/bill-zhang1/",
  devpost: "https://devpost.com/IdkwhatImD0ing",
} as const;

export const PROJECTS: Project[] = [
  {
    id: "sentinelai",
    name: "SentinelAI",
    year: 2025,
    summary:
      "Always-on public safety AI. Monitors building audio, detects panic, and triggers a multi-agent response in real time.",
    tags: ["ai", "voice", "safety"],
    accent: "magenta",
    github: "https://github.com/Christopher-Chhim/HackDavis",
    demo: "https://youtu.be/qr3pMPU8lFY",
    videoUrl: "https://youtu.be/qr3pMPU8lFY",
    poster: "/project-posters/sentinelai.webp",
    stack: [
      "Whisper",
      "YAMNet",
      "vLLM + Llama 3.3",
      "Twilio",
      "Retell",
      "Next.js",
      "Three.js",
      "Supabase",
    ],
    role: "Lead AI engineer · audio detection + LLM superintendent",
    long: "SentinelAI turns a building into an always-on safety partner. Edge audio models detect screams, glass breaks, stampedes, and alarms; a streaming Llama 3.3 superintendent speaks calm evacuation or lockdown guidance through phones and intercoms; simulated smart doors, alarms, signage, and lights react by zone. Human operators keep override control from a live 3D command dashboard.",
  },
  {
    id: "courtvision",
    name: "CourtVision",
    year: 2025,
    summary:
      "3D AI replay for coaches, analysts, and refs. Turns 2D sports footage into voice-queryable tactical views.",
    tags: ["ai", "voice", "3d"],
    accent: "violet",
    github: "https://github.com/aurelisajuan/ai2025",
    demo: "https://d112y698adiu2z.cloudfront.net/photos/production/software_photos/003/502/448/datas/gallery.jpg",
    poster: "/project-posters/courtvision.webp",
    stack: ["Video Gaussians", "Retell AI", "OpenAI Multimodal", "ElevenLabs V3", "WebGL", "VR"],
    role: "Engineer · pipeline + voice agent",
    long: "CourtVision is a 3D AI replay system for coaches, analysts, athletes, and refs. It reconstructs game footage with Video Gaussians, lets users rotate and inspect plays instead of watching a flat clip, and adds a voice layer powered by Retell, multimodal OpenAI models, and ElevenLabs so users can ask tactical questions about the replay.",
  },
  {
    id: "dispatchai",
    name: "Dispatch AI",
    year: 2024,
    summary:
      "Empathetic 911 dispatcher co-pilot. Aggregates emergency calls, triages severity, extracts context, and keeps humans in control.",
    tags: ["ai", "voice", "safety", "winner"],
    award: "Grand Prize — UC Berkeley AI Hackathon 2024",
    accent: "magenta",
    github: "https://github.com/IdkwhatImD0ing/DispatchAI",
    demo: "https://youtu.be/hdpdgxrilQM",
    videoUrl: "https://youtu.be/hdpdgxrilQM",
    poster: "/project-posters/dispatchai.webp",
    projectUrl: "https://dispatchai.art3m1s.me/",
    stack: ["Mistral (fine-tuned)", "Twilio", "Hume EVI", "Retell", "Intel Dev Cloud", "Next.js"],
    role: "Co-creator · model fine-tuning + agent runtime",
    long: "DispatchAI reimagines emergency response for understaffed call centers. It aggregates simultaneous 911 calls onto one dispatcher platform, filters them by severity, captures location, time, and caller emotion from the live call, and recommends actions such as dispatching an ambulance. A human-in-the-loop design keeps dispatchers as the final decision makers while a fine-tuned Mistral model and Intel IPEX optimization cut inference from minutes to seconds.",
  },
  {
    id: "talktuahbank",
    name: "TalkTuahBank",
    year: 2024,
    summary:
      "Voice banking over a regular phone call. No internet, smartphone, or banking app required.",
    tags: ["voice", "fintech", "ai", "winner"],
    award: "Grand + Goldman Sachs — HackUTD 2024",
    accent: "violet",
    github: "https://github.com/aurelisajuan/TalkTuahBank",
    demo: "https://youtu.be/YsH_z1azXSA",
    videoUrl: "https://www.youtube.com/watch?v=YsH_z1azXSA",
    poster: "/project-posters/talktuahbank.webp",
    projectUrl: "https://talktuah.art3m1s.me/",
    stack: ["Retell AI", "OpenAI Swarm", "Pinata (IPFS)", "Next.js", "Tailwind", "ShadCN"],
    role: "Voice + multi-agent backend",
    long: "TalkTuahBank is a multi-agent banking assistant for the 1.7 billion adults without bank access. A real phone call routes through Retell AI into a FastAPI/OpenAI Swarm backend, while the operator console reflects balances, transfers, bill pay, and agent handoffs in real time. The repo also ships a Next.js project site with demo, console, architecture, and build walkthrough routes.",
  },
  {
    id: "adapted",
    name: "AdaptEd",
    year: 2024,
    summary:
      "Lectures that talk back. A voice tutor with Gemini-driven slides and emotion-aware pacing.",
    tags: ["ai", "voice", "education", "winner"],
    award: "Google Challenge — LA Hacks 2024",
    accent: "magenta",
    github: "https://github.com/IdkwhatImD0ing/AdaptEd",
    demo: "https://youtu.be/8o1YJUFBcAw",
    videoUrl: "https://www.youtube.com/watch?v=8o1YJUFBcAw",
    poster: "/project-posters/adapted.webp",
    stack: ["Gemini 1.5 Pro", "Fetch.ai", "Hume EVI", "Intel Dev Cloud", "Auth0", "MongoDB"],
    role: "Agent runtime + slide-state engine",
    long: "AdaptEd is a hackathon-winning AI lecture showcase. The original LA Hacks stack paired FastAPI, LangChain, Retell AI, Gemini, Hume, Fetch.ai, Auth0, MongoDB, and Intel Dev Cloud; the repo now preserves that backend as an artifact and ships a production-style Next.js frontend with a scripted Red-Black Trees lecture, pre-rendered voice clips, dynamic slides, transcript, research timeline, and interruptible prompt chips.",
  },
  {
    id: "slugloop",
    name: "SlugLoop",
    year: 2023,
    summary:
      "Real-time UCSC loop bus tracker. Helped students see live campus bus locations and reduce pressure on metro routes.",
    tags: ["transit", "social-good", "winner"],
    award: "MLH GitHub — CruzHacks 2023",
    accent: "violet",
    github: "https://github.com/IdkwhatImD0ing/SlugLoop",
    demo: "https://youtu.be/DlAGp-IjtJM",
    videoUrl: "https://youtu.be/DlAGp-IjtJM",
    poster: "/project-posters/slugloop.webp",
    projectUrl: "https://www.slugloop.com/",
    stack: ["React", "Material UI", "ExpressJS", "Firebase", "C", "LibCurl", "Azure"],
    role: "Co-creator · frontend + real-time transit data",
    long: "SlugLoop is a real-time bus tracking app for UC Santa Cruz students. It uses existing GPS hardware on loop buses, processes location data through an ExpressJS service, stores updates in Firebase, and renders a mobile-friendly React map so students can choose campus loop buses more confidently. The project won MLH's Most Creative Use of GitHub at CruzHacks 2023 and was selected as a Google Solution Challenge 2023 Global Top 10 finalist.",
  },
  {
    id: "vocalyze",
    name: "Vocalyze",
    year: 2025,
    summary:
      "Conversational AI for banking applications. Phone calls become filled forms, synced data, and clearer financial choices.",
    tags: ["voice", "fintech", "ai", "winner"],
    award: "Letta + Finance — HackMerced X",
    accent: "violet",
    github: "https://github.com/IdkwhatImD0ing/idkwhatthisprojectis",
    demo: "https://youtu.be/s8wF-xCPY04",
    videoUrl: "https://youtu.be/s8wF-xCPY04",
    poster: "/project-posters/vocalyze.webp",
    stack: ["Retell AI", "OpenAI GPT-4", "Letta", "Supabase"],
    role: "Conversational architect",
    long: "Vocalyze simplifies banking applications with a conversational voice assistant. Retell AI handles live calls, GPT-4 parses and explains the user intent, Letta maintains state across the application flow, and Supabase syncs form data in real time. The README frames the goal as making banking easier, more inclusive, and ready for multilingual expansion and financial-literacy guidance.",
  },
  {
    id: "soundsearch",
    name: "SoundSearch",
    year: 2024,
    summary:
      "Phone-call voice guidance for complex websites. A caller gets step-by-step spoken help while the page highlights what to do next.",
    tags: ["voice", "ai", "accessibility", "winner"],
    award: "NLX Overall — AI ATL 2024",
    accent: "magenta",
    github: "https://github.com/IdkwhatImD0ing/AIATL",
    demo: "https://youtu.be/RgH-i9SYj-o",
    videoUrl: "https://youtu.be/RgH-i9SYj-o",
    projectUrl: "https://devpost.com/software/maybe-zc19va",
    stack: ["NLX.ai", "AWS", "Next.js", "Google Flights"],
    role: "Solo builder · voice navigation + web guidance",
    long: "SoundSearch makes complex websites easier to use through real-time voice guidance over a phone call. The caller describes what they need, the assistant synchronizes with the page, highlights relevant sections, and walks through forms, filters, and navigation step by step. The Devpost page frames it around accessibility for users who have trouble seeing or are not proficient in the website's language.",
  },
  {
    id: "swarmaid",
    name: "SwarmAid",
    year: 2024,
    summary:
      "Decentralized food rescue agents. Matches surplus suppliers to food banks and shelters with real-time logistics planning.",
    tags: ["ai", "social-good", "winner"],
    award: "2nd Place — Hack Dearborn 2024",
    accent: "violet",
    github: "https://github.com/IdkwhatImD0ing/SwarmAid",
    demo: "https://youtu.be/Vk73UiZksvo",
    videoUrl: "https://youtu.be/Vk73UiZksvo",
    stack: ["Swarm", "Python", "Leaflet.js", "Realtime APIs", "Multi-agent orchestration"],
    role: "Agent systems + logistics flow",
    long: "SwarmAid uses a decentralized AI system to connect suppliers with surplus food to food banks and shelters in real time. Supply agents detect available surplus, demand agents match it to community needs, logistics agents plan efficient routes, and compliance agents keep food-safety constraints in view. The proof of concept won 2nd Place at Hack Dearborn: Rewind Reality.",
  },
  {
    id: "secway",
    name: "SecWay",
    year: 2025,
    summary:
      "Lightweight browser security companion. Explains risky permissions in plain English instead of scaring users.",
    tags: ["ai", "security"],
    accent: "violet",
    github: "https://github.com/aurelisajuan/DiamondHacks",
    demo: "https://youtu.be/s5A4NHD3QEo",
    videoUrl: "https://youtu.be/s5A4NHD3QEo",
    poster: "/project-posters/secway.webp",
    stack: ["Gemini 2.5 Turbo", "Google Safe Browsing", "PhishTank", "Chrome Extension API"],
    role: "Privacy UX + AI guidance",
    long: "SecWay focuses on user-centric security design: empowerment over scare tactics. It watches browser permission risk, uses conversational Gemini-powered guidance to educate users in context, and stays lightweight enough to feel like a companion instead of browser bloat. The goal is simple privacy decisions, explained at the moment they matter.",
  },
  {
    id: "slugmeditate",
    name: "SlugMeditate",
    year: 2025,
    summary:
      "Transform a calming thought into an immersive VR journey with generative media and Gaussian splats.",
    tags: ["ai", "3d"],
    accent: "magenta",
    github: "https://github.com/briankhoi/slugmeditate",
    demo: "https://d112y698adiu2z.cloudfront.net/photos/production/software_photos/003/374/704/datas/gallery.jpg",
    poster: "/project-posters/slugmeditate.webp",
    stack: ["Imagen 3", "Veo 2", "Gaussian Splatting", "Niantic Studio WebXR", "MusicFX"],
    role: "Pipeline engineer",
    long: "SlugMeditate turns a reflection like 'a peaceful forest at dusk' into a browser-based VR escape. Imagen 3 generates the visual seed, Veo 2 animates it into cinematic video, Gaussian Splatting maps it into a volumetric 3D scene, Niantic Studio WebXR renders the environment, and Google MusicFX creates ambient sound tailored to the prompt.",
  },
  {
    id: "talktuahduck",
    name: "TalkTuahDuck",
    year: 2025,
    summary:
      "Rubber-duck your study materials. Upload messy notes and talk through them until they click.",
    tags: ["ai", "voice", "education"],
    accent: "violet",
    github: "https://github.com/AureliaSindhu/sbhacks",
    demo: "https://youtu.be/hlBz5ejdrUc",
    videoUrl: "https://youtu.be/hlBz5ejdrUc",
    poster: "/project-posters/talktuahduck.webp",
    stack: ["Sycamore", "SingleStore", "Retell", "Next.js", "RAG pipeline"],
    role: "RAG + retrieval engineer",
    long: "TalkTuahDuck applies the classic 'rubber ducking' technique to studying. It ingests messy learning materials, builds a retrieval-backed knowledge base, and lets students reason out loud with a voice assistant that can cite the source material instead of drifting into generic tutoring.",
  },
  {
    id: "tft",
    name: "TeamFood Tactics",
    year: 2025,
    summary:
      "Voice-based food distribution assistant. Any phone can log surplus food or find nearby help.",
    tags: ["voice", "ai", "winner"],
    award: "Sustainability — SpartaHack X",
    accent: "violet",
    github: "https://github.com/aurelisajuan/spartaHacks",
    demo: "https://d112y698adiu2z.cloudfront.net/photos/production/software_photos/003/249/428/datas/gallery.jpg",
    poster: "/project-posters/tft.webp",
    stack: ["Retell AI", "OpenAI", "OpenAI Swarm", "FastAPI", "Supabase"],
    role: "Voice + matching backend",
    long: "TeamFood Tactics is a phone-accessible food distribution assistant for sustainability work. Built with Next.js, Python/FastAPI, Supabase, Retell AI, and OpenAI Swarm, it lets surplus suppliers and people looking for food interact by voice while the backend matches dietary needs, availability, and location in real time.",
  },
  {
    id: "splatnft",
    name: "SplatNFT",
    year: 2024,
    summary:
      "Gaussian Splatting plus NFTs. Turn personal video into interactive 3D assets minted on Solana.",
    tags: ["3d", "web3", "winner"],
    award: "SolanaU — SoCal Tech Week",
    accent: "magenta",
    github: "https://github.com/KevinWu098/SplatNFT",
    demo: "https://d112y698adiu2z.cloudfront.net/photos/production/software_photos/003/130/048/datas/gallery.jpg",
    poster: "/project-posters/splatnft.webp",
    projectUrl: "https://devpost.com/software/splatnft",
    stack: ["Solana", "Anyone Protocol", "Gaussian Splatting", "Next.js", "Node.js"],
    role: "Frontend + minting flow",
    long: "SplatNFT combines Gaussian Splatting and NFTs. The frontend uses React, TypeScript, Next.js, Tailwind, and shadcn/ui; the backend uses Node, Express, OpenAI, FFmpeg, Solana, and IPFS. Users upload personal video, process it into an interactive 3D splat, preview it, and mint it as a Solana-backed NFT stored through decentralized infrastructure.",
  },
  {
    id: "instarizz",
    name: "InstaRizz",
    year: 2024,
    summary:
      "Wearable-powered social assistant. Ray-Ban live video becomes real-time bios and pickup lines.",
    tags: ["ai", "wearable"],
    accent: "magenta",
    github: "https://github.com/coderkai03/AI-ATL-2024",
    demo: "https://youtu.be/xjMcK34BBu4",
    videoUrl: "https://youtu.be/xjMcK34BBu4",
    poster: "/project-posters/instarizz.webp",
    stack: ["Ray-Ban Meta", "OpenCV", "Magic Loops", "GPT-4", "Streamlit"],
    role: "Pipeline + ethics framing",
    long: "InstaRizz explores the intersection of AI, social interaction, and wearable technology. Ray-Ban smart glasses stream live video to Instagram, OpenCV captures frames and recognizes faces, a custom identity search matches people from a database, and Magic Loops plus GPT-4 generate a short bio and three pickup lines in real time. The repo also calls out latency optimization and privacy controls as core ethical constraints.",
  },
];

export const HACKATHONS: Hackathon[] = [
  { name: "SpartaHack X", year: 2025, award: "Sustainability" },
  { name: "HackMerced X", year: 2024, award: "Letta + Finance" },
  { name: "Hack Dearborn", year: 2024, award: "2nd Place" },
  { name: "HackUTD 2024", year: 2024, award: "Grand Prize + Goldman Sachs" },
  { name: "UC Berkeley AI 2024", year: 2024, award: "Grand Prize $25k" },
  { name: "CruzHacks 2023", year: 2023, award: "MLH GitHub" },
  { name: "LA Hacks", year: 2024, award: "Google Challenge" },
  { name: "AI ATL 24", year: 2024, award: "NLX Overall" },
  { name: "SoCal Tech Week", year: 2024, award: "SolanaU" },
];

export const EDUCATION: Education[] = [
  {
    school: "USC",
    full: "University of Southern California",
    degree: "M.S. Computer Science — AI Specialization",
    when: "Aug 2023 — May 2025",
    detail:
      "Graduate-level ML, applied AI, agentic systems. Built voice-first products throughout.",
    logo: "/usc.png",
  },
  {
    school: "UCSC",
    full: "UC Santa Cruz",
    degree: "B.S. Computer Science",
    when: "Sep 2020 — Mar 2023",
    detail: "Finished a 4-year program in 2.5 years. Caught the hackathon bug.",
    logo: "/ucsc.png",
  },
  {
    school: "Lynbrook",
    full: "Lynbrook High School",
    degree: "College Prep",
    when: "2016 — 2020",
    detail: "South Bay. First wrote code here.",
    logo: "/lynbrook.png",
  },
];

export const EXPERIENCE: ExperienceEntry[] = [
  {
    when: "Jun 2025 — Now",
    role: "Applied AI Engineer",
    where: "Scale AI · San Francisco",
    body: "Enterprise Generative AI Platform team. Building agentic automation, LLM evaluation workflows, and multi-agent systems for enterprise AI.",
    badge: "Now",
  },
  {
    when: "Sep 2023 — Jun 2025",
    role: "AI Engineer",
    where: "RingCentral · Remote",
    body: "Shipped LLM evaluations and multi-agent assistants for customer-support workflows after starting as a senior AI intern building LLM-powered assistant prototypes.",
  },
  {
    when: "Jun 2024 — Dec 2024",
    role: "Co-founder + CFO",
    where: "Dispatch AI · Remote",
    body: "Built an emergency-response AI platform with Berkeley SkyDeck funding. Solo-engineered the voice AI and telephony integration behind the dispatcher demo.",
  },
  {
    when: "May 2024 — Dec 2024",
    role: "Co-founder",
    where: "WeCracked · Remote",
    body: "Co-founded a 4K-member hackathon community with sponsor backing, helping student builders find teams, ship faster, and learn from winning projects.",
  },
  {
    when: "2023 — 2025+",
    role: "Hackathon Mainstay",
    where: "36 wins across the hackathon circuit",
    body: "Mainly competed during college and still jumps into select events. Most of the projects on this page started as weekend builds.",
  },
];

export const SKILLS_LINE: SkillsLineWord[] = [
  { w: "I build" },
  { w: "voice-first" },
  { w: "agents", tag: true },
  { w: "that ship in" },
  { w: "weekends,", tag: true },
  { w: "win" },
  { w: "grand prizes,", tag: true },
  { w: "and run in" },
  { w: "production." },
  { w: "I care about" },
  { w: "latency,", tag: true },
  { w: "human-in-the-loop", tag: true },
  { w: "control, and the" },
  { w: "quiet craft", tag: true },
  { w: "of making AI feel like a" },
  { w: "real" },
  { w: "product." },
];

export const PERSONAL_FACTS: PersonalFact[] = [
  { icon: "✦", line: "Finished a 4-year CS degree in <b>2.5 years</b>." },
  { icon: "✦", line: "Won my first hackathon at <b>17</b>. Haven't slowed down." },
  { icon: "✦", line: "Speaks <b>Mandarin and English</b>; building agents in both." },
  { icon: "✦", line: "If I'm not coding, I'm probably <b>climbing</b> or chasing good coffee." },
  { icon: "✦", line: "Plays <b>drums and piano</b> on the side." },
  { icon: "✦", line: "Believe the next billion users will <b>talk to software</b>, not click it." },
];
