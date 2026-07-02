import { type Project } from "@/lib/portfolio-data";
import { isImage, toEmbed } from "@/lib/video-embed";

export function ProjectDetail({
  project,
  onClose,
}: {
  project: Project;
  onClose: () => void;
}) {
  const p = project;
  const demoLink = p.videoUrl ?? p.demo;
  const embed = toEmbed(demoLink);
  const img = !embed && isImage(p.demo) ? p.demo : null;

  return (
    <div
      onClick={onClose}
      className="fixed inset-0 z-[200] bg-[rgba(4,3,12,0.78)] backdrop-blur-[18px] grid place-items-center p-8 animate-scrim-in"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="relative w-[min(1080px,100%)] max-h-[calc(100vh-64px)] bg-gradient-to-b from-[#14101e] to-[#0c0916] border border-line rounded-[22px] overflow-auto shadow-[0_40px_120px_rgba(168,85,247,0.18),0_0_0_1px_rgba(168,85,247,0.12)] animate-detail-in"
      >
        <button
          type="button"
          onClick={onClose}
          data-cursor-hover
          className="sticky top-4 left-[calc(100%-56px)] z-[4] w-10 h-10 rounded-full bg-[rgba(15,12,28,0.85)] border border-line text-ink text-[22px] leading-none cursor-pointer grid place-items-center transition-[background-color,transform] duration-200 hover:bg-magenta hover:text-white hover:rotate-90"
        >
          ×
        </button>
        <div className="px-9 pt-2 -mt-10 max-[800px]:px-6">
          <div className="inline-flex items-center gap-2 font-mono text-[11px] tracking-[0.18em] uppercase text-violet">
            <span className="w-1.5 h-1.5 rounded-full bg-magenta shadow-[0_0_10px_var(--magenta)]" />
            {p.award ? `★ ${p.award}` : `Project · ${p.year}`}
          </div>
          <h3 className="font-serif text-[clamp(36px,4.4vw,56px)] -tracking-[0.02em] leading-[1.02] mt-3 mb-2 bg-gradient-to-br from-ink to-violet bg-clip-text text-transparent">
            {p.name}
          </h3>
          <p className="text-ink-soft text-[17px] leading-[1.5] max-w-[720px]">{p.summary}</p>
        </div>
        <div className="mx-9 mt-6 rounded-[14px] overflow-hidden border border-line aspect-video bg-[#050410] relative max-[800px]:mx-6 max-[800px]:mt-[18px]">
          {embed ? (
            <iframe
              src={embed}
              title={`${p.name} demo video`}
              allow="accelerometer; autoplay; encrypted-media; gyroscope; picture-in-picture"
              allowFullScreen
              loading="lazy"
              className="absolute inset-0 w-full h-full border-0"
            />
          ) : img ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={img} alt={p.name} className="absolute inset-0 w-full h-full object-cover" />
          ) : (
            <div className="absolute inset-0 grid place-items-center bg-[radial-gradient(circle_at_50%_40%,rgba(168,85,247,0.18),transparent_60%)] text-center">
              <div>
                <span className="block font-serif text-[64px] -tracking-[0.02em] bg-gradient-to-br from-violet to-magenta bg-clip-text text-transparent">
                  /{p.id}
                </span>
                <span className="text-muted font-mono text-[12px] tracking-[0.12em] uppercase mt-3 block">
                  Demo media not available. Check the project links.
                </span>
              </div>
            </div>
          )}
        </div>
        <div className="grid grid-cols-[1.6fr_1fr] gap-8 px-9 pt-8 pb-9 max-[800px]:grid-cols-1 max-[800px]:gap-6 max-[800px]:px-6">
          <div>
            <h5 className="font-mono text-[11px] tracking-[0.18em] uppercase text-muted mb-3">
              The story
            </h5>
            <p className="text-ink-soft text-[16px] leading-[1.65] mb-6 text-pretty">
              {p.long || p.summary}
            </p>
            {p.role && (
              <div className="grid grid-cols-[80px_1fr] gap-4 py-3.5 border-t border-line-soft items-start">
                <span className="font-mono text-[10.5px] tracking-[0.18em] uppercase text-muted pt-1">
                  Role
                </span>
                <span className="text-ink text-[14.5px] leading-[1.55]">{p.role}</span>
              </div>
            )}
            {p.stack && (
              <div className="grid grid-cols-[80px_1fr] gap-4 py-3.5 border-t border-line-soft items-start">
                <span className="font-mono text-[10.5px] tracking-[0.18em] uppercase text-muted pt-1">
                  Stack
                </span>
                <span className="flex flex-wrap gap-1.5">
                  {p.stack.map((s) => (
                    <span
                      key={s}
                      className="font-mono text-[11px] px-2.5 py-1 border border-line rounded-md bg-[rgba(168,85,247,0.08)] text-ink"
                    >
                      {s}
                    </span>
                  ))}
                </span>
              </div>
            )}
          </div>
          <div className="flex flex-col gap-[18px]">
            <div className="grid grid-cols-[60px_1fr] gap-x-3.5 gap-y-2.5 px-[18px] py-[18px] border border-line rounded-xl bg-[rgba(15,12,28,0.4)] text-[13.5px]">
              <span className="font-mono text-[10.5px] tracking-[0.18em] uppercase text-muted self-center">
                Year
              </span>
              <span>{p.year}</span>
              <span className="font-mono text-[10.5px] tracking-[0.18em] uppercase text-muted self-center">
                ID
              </span>
              <span>/{p.id}</span>
              <span className="font-mono text-[10.5px] tracking-[0.18em] uppercase text-muted self-center">
                Tags
              </span>
              <span className="flex flex-wrap gap-1.5">
                {p.tags.map((t) => (
                  <em
                    key={t}
                    className="not-italic font-mono text-[11px] text-violet px-2 py-0.5 rounded-full bg-[rgba(126,109,253,0.12)] border border-[rgba(126,109,253,0.3)]"
                  >
                    #{t}
                  </em>
                ))}
              </span>
            </div>
            <div className="flex flex-col gap-2">
              {demoLink && !embed && (
                <a
                  href={demoLink}
                  target="_blank"
                  rel="noopener noreferrer"
                  data-cursor-hover
                  className="flex items-center gap-3 px-4 py-3.5 rounded-[10px] border border-line bg-[rgba(15,12,28,0.5)] text-ink no-underline text-[14px] transition-[background-color,border-color,transform] duration-200 hover:bg-[rgba(168,85,247,0.12)] hover:border-violet hover:translate-x-[3px]"
                >
                  <span className="w-7 h-7 grid place-items-center font-mono text-[12px] rounded-full bg-gradient-to-br from-violet to-magenta text-white">
                    ▶
                  </span>{" "}
                  View demo media
                </a>
              )}
              {p.projectUrl && (
                <a
                  href={p.projectUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  data-cursor-hover
                  className="flex items-center gap-3 px-4 py-3.5 rounded-[10px] border border-line bg-[rgba(15,12,28,0.5)] text-ink no-underline text-[14px] transition-[background-color,border-color,transform] duration-200 hover:bg-[rgba(168,85,247,0.12)] hover:border-violet hover:translate-x-[3px]"
                >
                  <span className="w-7 h-7 grid place-items-center font-mono text-[12px] rounded-full bg-gradient-to-br from-violet to-magenta text-white">
                    ↗
                  </span>{" "}
                  Live project
                </a>
              )}
              {p.github && (
                <a
                  href={p.github}
                  target="_blank"
                  rel="noopener noreferrer"
                  data-cursor-hover
                  className="flex items-center gap-3 px-4 py-3.5 rounded-[10px] border border-line bg-[rgba(15,12,28,0.5)] text-ink no-underline text-[14px] transition-[background-color,border-color,transform] duration-200 hover:bg-[rgba(168,85,247,0.12)] hover:border-violet hover:translate-x-[3px]"
                >
                  <span className="w-7 h-7 grid place-items-center font-mono text-[12px] rounded-full bg-gradient-to-br from-violet to-magenta text-white">
                    {`</>`}
                  </span>{" "}
                  Source on GitHub
                </a>
              )}
            </div>
            <div className="px-4 py-3.5 rounded-[10px] border border-dashed border-[rgba(168,85,247,0.35)] bg-[rgba(168,85,247,0.05)]">
              <span className="font-mono text-[10.5px] tracking-[0.18em] uppercase text-magenta">
                Voice tip
              </span>
              <p className="mt-1.5 text-ink-soft text-[13px] leading-[1.5]">
                &ldquo;Tell me more about{" "}
                <em className="text-ink italic font-serif">{p.name.toLowerCase()}</em>
                &rdquo; opens this view.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
