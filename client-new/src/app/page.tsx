import { BgStage } from "@/components/bg-stage";
import { CustomCursor } from "@/components/custom-cursor";
import { ScrollProgressBar } from "@/components/scroll-progress-bar";
import { Topbar } from "@/components/topbar";
import { VoiceOrb } from "@/components/voice-orb";
import { HeroSection } from "@/components/sections/hero";
import { AboutSection } from "@/components/sections/about";
import { ProjectsSection } from "@/components/sections/projects";
import { HackathonsSection } from "@/components/sections/hackathons";
import { ExperienceSection } from "@/components/sections/experience";
import { EducationSection } from "@/components/sections/education";
import { SkillsSection } from "@/components/sections/skills";
import { ResumeSection } from "@/components/sections/resume";
import { ArchitectureSection } from "@/components/sections/architecture";
import { PersonalSection, FooterSection } from "@/components/sections/personal";

export default function Home() {
  return (
    <>
      <BgStage />
      <ScrollProgressBar />
      <CustomCursor />
      <Topbar />

      <main>
        <HeroSection />
        <AboutSection />
        <ProjectsSection />
        <HackathonsSection />
        <ExperienceSection />
        <EducationSection />
        <SkillsSection />
        <ResumeSection />
        <ArchitectureSection />
        <PersonalSection />
        <FooterSection />
      </main>

      <VoiceOrb />
    </>
  );
}
