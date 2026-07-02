/* global React */
const { useRef } = React;

const ABOUT = [
  {
    num: "01 / WHO",
    title: "I make AI feel like a real product.",
    body: "Most AI demos crumble under a real conversation. I obsess over the seams — latency, interruption handling, tool-use, fallback. The work that survives contact with users is the work I want to do.",
  },
  {
    num: "02 / WHAT",
    title: "Voice-first, agent-shaped systems.",
    body: "Phones. Smart glasses. Browser sidebars. Pinned terminals. Wherever the interface is least visual, I'm trying to make it more useful — for banking, education, public safety, food rescue, sports tape.",
  },
  {
    num: "03 / HOW",
    title: "Ship a startup-grade product every weekend.",
    body: "Twelve hackathon wins is a lot of weekends. The discipline of 36 hours sharpens the instinct: pick the smallest demo that proves the hypothesis, build the spine first, decorate last.",
  },
  {
    num: "04 / WHY",
    title: "The next billion users will talk to software.",
    body: "Most people on Earth still type slower than they speak — and a lot of them never learned to type at all. Every product I touch tries to bend the floor of access a little closer to the ground.",
  },
];

window.AboutSection = function AboutSection() {
  return (
    <section id="about" className="container" style={{ padding: "180px 32px 60px" }} data-screen-label="02 About">
      <div className="reveal" ref={window.useReveal()}>
        <span className="section-eyebrow"><span className="dot"></span>ABOUT</span>
        <h2 className="section-title">A builder who <em>listens</em> first.</h2>
      </div>

      <div className="stack-wrap" style={{ marginTop: 80 }}>
        {ABOUT.map((c, i) => (
          <article key={i} className="stack-card" data-i={i}>
            <div className="deco"></div>
            <div className="num">{c.num}</div>
            <h3>{c.title}</h3>
            <p>{c.body}</p>
          </article>
        ))}
      </div>
    </section>
  );
};
