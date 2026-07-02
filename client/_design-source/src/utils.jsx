/* global React */
const { useEffect, useRef, useState, useCallback, useLayoutEffect } = React;

// ── Hooks ──────────────────────────────────────────────────
window.useScrollProgress = function (ref, { offset = 0, throttle = 16 } = {}) {
  const [p, setP] = useState(0);
  useEffect(() => {
    const el = ref.current; if (!el) return;
    let raf = 0;
    const update = () => {
      const r = el.getBoundingClientRect();
      const start = r.top - window.innerHeight + offset;
      const dist = r.height + window.innerHeight - offset * 2;
      const x = Math.max(0, Math.min(1, -start / dist));
      setP(x);
    };
    const onScroll = () => { cancelAnimationFrame(raf); raf = requestAnimationFrame(update); };
    update();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    return () => { window.removeEventListener("scroll", onScroll); window.removeEventListener("resize", onScroll); };
  }, []);
  return p;
};

window.useInView = function (ref, threshold = 0.18) {
  const [v, setV] = useState(false);
  useEffect(() => {
    const el = ref.current; if (!el) return;
    const io = new IntersectionObserver(([e]) => { if (e.isIntersecting) { setV(true); io.disconnect(); } }, { threshold });
    io.observe(el);
    return () => io.disconnect();
  }, []);
  return v;
};

window.useReveal = function () {
  const ref = useRef(null);
  const seen = useInView(ref, 0.15);
  useEffect(() => { if (seen && ref.current) ref.current.classList.add("in"); }, [seen]);
  return ref;
};

// ── Voice command bus ──────────────────────────────────────
window.VoiceBus = (() => {
  const listeners = new Set();
  return {
    on: (fn) => { listeners.add(fn); return () => listeners.delete(fn); },
    emit: (cmd) => listeners.forEach((fn) => fn(cmd)),
  };
})();

// ── Custom cursor ──────────────────────────────────────────
window.CustomCursor = function CustomCursor() {
  const dotRef = useRef(null), ringRef = useRef(null);
  useEffect(() => {
    if (window.matchMedia("(max-width: 900px)").matches) return;
    let mx = 0, my = 0, rx = 0, ry = 0, raf;
    const onMove = (e) => {
      mx = e.clientX; my = e.clientY;
      if (dotRef.current) dotRef.current.style.transform = `translate3d(${mx - 3}px, ${my - 3}px, 0)`;
    };
    const tick = () => {
      rx += (mx - rx) * 0.18; ry += (my - ry) * 0.18;
      if (ringRef.current) ringRef.current.style.transform = `translate3d(${rx - 18}px, ${ry - 18}px, 0)`;
      raf = requestAnimationFrame(tick);
    };
    const onOver = (e) => {
      const t = e.target;
      const hov = t.closest && t.closest("a, button, .chip, .cmd, .proj-filter, .edu-card, .voice-orb-bubble, [data-cursor-hover]");
      dotRef.current?.classList.toggle("is-hover", !!hov);
      ringRef.current?.classList.toggle("is-hover", !!hov);
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseover", onOver);
    raf = requestAnimationFrame(tick);
    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseover", onOver);
      cancelAnimationFrame(raf);
    };
  }, []);
  return (
    <React.Fragment>
      <div ref={dotRef} className="cursor-dot"></div>
      <div ref={ringRef} className="cursor-ring"></div>
    </React.Fragment>
  );
};

// ── Scroll progress bar ────────────────────────────────────
window.ScrollProgressBar = function ScrollProgressBar() {
  const ref = useRef(null);
  useEffect(() => {
    const onScroll = () => {
      const h = document.documentElement;
      const p = h.scrollTop / Math.max(1, h.scrollHeight - h.clientHeight);
      if (ref.current) ref.current.style.transform = `scaleX(${p})`;
    };
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);
  return <div ref={ref} className="scroll-progress" />;
};

// ── Topbar ─────────────────────────────────────────────────
window.Topbar = function Topbar() {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => { const t = setInterval(() => setNow(new Date()), 30000); return () => clearInterval(t); }, []);
  const time = now.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", hour12: false });
  return (
    <div className="topbar">
      <div className="left">
        <span className="pill brand">Bill Zhang ✦ v2026</span>
      </div>
      <div className="right">
        <span className="pill"><span style={{width:6, height:6, borderRadius:"50%", background:"#4ade80", boxShadow:"0 0 8px #4ade80"}}></span>Voice ready</span>
        <span className="pill">LA · {time}</span>
      </div>
    </div>
  );
};

// ── Background stage ───────────────────────────────────────
window.BgStage = function BgStage() {
  return (
    <React.Fragment>
      <div className="bg-stage"></div>
      <div className="bg-noise"></div>
    </React.Fragment>
  );
};

// ── Smooth-scroll helper ───────────────────────────────────
window.scrollToSection = function (id) {
  const el = document.getElementById(id);
  if (!el) return;
  const y = el.getBoundingClientRect().top + window.scrollY;
  window.scrollTo({ top: y, behavior: "smooth" });
};

Object.assign(window, { useScrollProgress, useInView });
