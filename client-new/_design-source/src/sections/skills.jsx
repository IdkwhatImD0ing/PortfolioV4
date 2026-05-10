/* global React */
const { useEffect, useRef, useState } = React;

window.SkillsSection = function SkillsSection() {
  const wrapRef = useRef(null);
  const [active, setActive] = useState(0);
  const words = window.SKILLS_LINE;

  useEffect(() => {
    const el = wrapRef.current; if (!el) return;
    const onScroll = () => {
      const r = el.getBoundingClientRect();
      const dist = el.offsetHeight - window.innerHeight;
      const p = Math.max(0, Math.min(1, -r.top / Math.max(1, dist)));
      const n = Math.round(p * (words.length - 1));
      setActive(n);
    };
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, [words.length]);

  return (
    <section id="skills" className="skills-section" data-screen-label="07 Skills" ref={wrapRef}>
      <div className="skills-pin">
        <div className="skills-words">
          {words.map((w, i) => (
            <span key={i} className={`word ${i <= active ? "active" : ""} ${w.tag ? "tag" : ""}`}>
              {w.w}
            </span>
          ))}
        </div>
      </div>
    </section>
  );
};
