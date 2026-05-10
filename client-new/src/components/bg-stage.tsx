const NOISE_SVG =
  "url(\"data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='160' height='160'><filter id='n'><feTurbulence type='fractalNoise' baseFrequency='1.4' numOctaves='2' stitchTiles='stitch'/><feColorMatrix values='0 0 0 0 1 0 0 0 0 1 0 0 0 0 1 0 0 0 0.6 0'/></filter><rect width='100%' height='100%' filter='url(%23n)' opacity='0.5'/></svg>\")";

export function BgStage() {
  return (
    <>
      <div
        className="fixed inset-0 -z-10 overflow-hidden bg-bg bg-[radial-gradient(1200px_700px_at_80%_-10%,rgba(192,132,252,0.18),transparent_60%),radial-gradient(1000px_700px_at_0%_30%,rgba(127,90,240,0.16),transparent_60%),radial-gradient(900px_600px_at_60%_110%,rgba(232,121,249,0.12),transparent_60%)] before:absolute before:inset-0 before:bg-[radial-gradient(rgba(255,255,255,0.05)_1px,transparent_1px)] before:[background-size:24px_24px] before:[mask-image:linear-gradient(180deg,black_0%,black_80%,transparent_100%)] before:opacity-60 before:content-['']"
      />
      <div
        className="fixed inset-0 -z-10 pointer-events-none opacity-[0.05] mix-blend-overlay"
        style={{ backgroundImage: NOISE_SVG }}
      />
    </>
  );
}
