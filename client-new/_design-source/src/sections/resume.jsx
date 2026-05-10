/* global React */

window.ResumeSection = function ResumeSection() {
  const stats = [
    { k: "Years building", v: "5+" },
    { k: "Hackathon wins", v: "12+" },
    { k: "Voice apps shipped", v: "8" },
    { k: "Lines of TS in prod", v: "120k" },
  ];
  return (
    <section id="resume" className="resume-section" data-screen-label="07 Resume">
      <div className="resume-inner">
        <div className="resume-head">
          <span className="section-eyebrow"><span className="dot"></span>RESUME · ONE-PAGER</span>
          <h2 className="section-title">The <em>printable</em> version.</h2>
          <p className="resume-lede">
            Same story, traditional format. Click through below or grab the PDF — both stay in lock-step with everything
            else on this page.
          </p>
        </div>

        <div className="resume-grid">
          <div className="resume-preview">
            <div className="resume-frame">
              <iframe src="assets/resume.pdf#toolbar=0&navpanes=0&view=FitH" title="Bill Zhang — Resume"></iframe>
            </div>
            <div className="resume-bar">
              <span className="rb-eyebrow">resume.pdf · last updated 2025</span>
              <div className="rb-actions">
                <a href="assets/resume.pdf" target="_blank" rel="noopener" data-cursor-hover className="rb-btn ghost">
                  <span>↗</span> Open in new tab
                </a>
                <a href="assets/resume.pdf" download="Bill-Zhang-Resume.pdf" data-cursor-hover className="rb-btn primary">
                  <span>↓</span> Download PDF
                </a>
              </div>
            </div>
          </div>

          <div className="resume-side">
            <div className="resume-stats">
              {stats.map((s) => (
                <div key={s.k} className="rstat">
                  <div className="v">{s.v}</div>
                  <div className="k">{s.k}</div>
                </div>
              ))}
            </div>

            <div className="resume-block">
              <div className="rb-head">At a glance</div>
              <ul>
                <li><strong>AI engineer</strong> — voice-first agents, multimodal pipelines, real-time inference.</li>
                <li><strong>Software engineer</strong> — voice-first agents, multimodal pipelines, real-time inference.</li>
                <li><strong>USC</strong> — Computer Science, B.S. (in progress).</li>
                <li><strong>Stack</strong> — TypeScript / Python / Rust, Next.js, Retell, Twilio, Mistral, Llama.</li>
              </ul>
            </div>

            <div className="resume-block">
              <div className="rb-head">Get in touch</div>
              <div className="rcontact">
                <a href="mailto:billzhang0011@gmail.com" data-cursor-hover>billzhang0011@gmail.com</a>
                <a href="https://github.com/" target="_blank" rel="noopener" data-cursor-hover>github.com/billzhang</a>
                <a href="https://linkedin.com/" target="_blank" rel="noopener" data-cursor-hover>linkedin.com/in/billzhang</a>
              </div>
            </div>

            <div className="resume-voice">
              <span className="eyebrow">Voice tip</span>
              <p>"Send me your resume." → opens the download.</p>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
};
