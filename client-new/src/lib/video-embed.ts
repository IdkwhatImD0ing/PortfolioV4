export function toEmbed(url?: string) {
  if (!url) return null;
  try {
    const parsed = new URL(url);
    if (parsed.hostname === "youtu.be") {
      const id = parsed.pathname.split("/").filter(Boolean)[0];
      return id ? `https://www.youtube.com/embed/${id}?rel=0&modestbranding=1` : null;
    }
    if (parsed.hostname === "youtube.com" || parsed.hostname.endsWith(".youtube.com")) {
      const embedId =
        parsed.searchParams.get("v") ??
        parsed.pathname.match(/^\/(?:embed|shorts)\/([^/?]+)/)?.[1];
      return embedId
        ? `https://www.youtube.com/embed/${embedId}?rel=0&modestbranding=1`
        : null;
    }
  } catch {
    return null;
  }
  return null;
}
export function isImage(url?: string) {
  // Anchored to end-of-path (allowing a query/fragment) so e.g. "clip.png.mp4"
  // or a ".jpg" buried mid-path doesn't count as an image.
  return /\.(jpg|jpeg|png|gif|webp)(\?|#|$)/i.test(url ?? "");
}
