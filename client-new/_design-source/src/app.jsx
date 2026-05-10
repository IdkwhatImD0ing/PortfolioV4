/* global React, ReactDOM,
   BgStage, Topbar, ScrollProgressBar, CustomCursor, VoiceOrb,
   HeroSection, AboutSection, ProjectsSection, HackathonsSection,
   ExperienceSection, EducationSection, SkillsSection, ResumeSection, ArchitectureSection, PersonalSection, FooterSection,
   VoiceBus
*/
const { useEffect } = React;

function App() {
  // Listen for scroll commands from voice bus too (in case orb fires without explicit handler)
  useEffect(() => VoiceBus.on((cmd) => {
    if (cmd.type === "scroll" && cmd.id) window.scrollToSection(cmd.id);
  }), []);

  return (
    <React.Fragment>
      <BgStage />
      <ScrollProgressBar />
      <CustomCursor />
      <Topbar />

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

      <VoiceOrb />
    </React.Fragment>
  );
}

const root = ReactDOM.createRoot(document.getElementById("root"));
root.render(<App />);
