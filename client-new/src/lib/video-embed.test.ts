import { describe, expect, it } from "vitest";
import { isImage, toEmbed } from "./video-embed";

describe("toEmbed", () => {
  it("converts youtu.be short links", () => {
    expect(toEmbed("https://youtu.be/abc123")).toBe(
      "https://www.youtube.com/embed/abc123?rel=0&modestbranding=1",
    );
  });

  it("converts youtube.com watch?v= links", () => {
    expect(toEmbed("https://www.youtube.com/watch?v=abc123")).toBe(
      "https://www.youtube.com/embed/abc123?rel=0&modestbranding=1",
    );
  });

  it("converts youtube.com /embed/ paths", () => {
    expect(toEmbed("https://www.youtube.com/embed/abc123")).toBe(
      "https://www.youtube.com/embed/abc123?rel=0&modestbranding=1",
    );
  });

  it("converts youtube.com /shorts/ paths", () => {
    expect(toEmbed("https://www.youtube.com/shorts/abc123")).toBe(
      "https://www.youtube.com/embed/abc123?rel=0&modestbranding=1",
    );
  });

  it("returns null for non-youtube urls", () => {
    expect(toEmbed("https://vimeo.com/12345")).toBeNull();
  });

  it("returns null for lookalike hostnames", () => {
    expect(toEmbed("https://notyoutube.com/watch?v=abc123")).toBeNull();
  });

  it("accepts youtube.com subdomains", () => {
    expect(toEmbed("https://m.youtube.com/watch?v=abc123")).toBe(
      "https://www.youtube.com/embed/abc123?rel=0&modestbranding=1",
    );
  });

  it("returns null for undefined input", () => {
    expect(toEmbed(undefined)).toBeNull();
  });

  it("returns null for empty input", () => {
    expect(toEmbed("")).toBeNull();
  });

  it("returns null for invalid urls", () => {
    expect(toEmbed("not a url")).toBeNull();
  });

  it("returns null for youtu.be without an id", () => {
    expect(toEmbed("https://youtu.be/")).toBeNull();
  });

  it("returns null for youtube.com without a video id", () => {
    expect(toEmbed("https://www.youtube.com/")).toBeNull();
  });
});

describe("isImage", () => {
  it("returns true for jpg/jpeg/png/gif/webp urls", () => {
    expect(isImage("https://example.com/a.jpg")).toBe(true);
    expect(isImage("https://example.com/a.jpeg")).toBe(true);
    expect(isImage("https://example.com/a.png")).toBe(true);
    expect(isImage("https://example.com/a.gif")).toBe(true);
    expect(isImage("https://example.com/a.webp")).toBe(true);
  });

  it("is case-insensitive", () => {
    expect(isImage("https://example.com/a.PNG")).toBe(true);
  });

  it("returns false for non-image urls", () => {
    expect(isImage("https://example.com/a.mp4")).toBe(false);
    expect(isImage("https://youtu.be/abc123")).toBe(false);
  });

  it("allows a query string or fragment after the extension", () => {
    expect(isImage("https://example.com/a.jpg?width=100")).toBe(true);
    expect(isImage("https://example.com/a.webp#frame")).toBe(true);
  });

  it("does not match an extension in the middle of the url", () => {
    expect(isImage("https://example.com/clip.png.mp4")).toBe(false);
    expect(isImage("https://example.com/a.jpg-gallery/video")).toBe(false);
  });

  it("returns false for undefined/empty input", () => {
    expect(isImage(undefined)).toBe(false);
    expect(isImage("")).toBe(false);
  });
});
