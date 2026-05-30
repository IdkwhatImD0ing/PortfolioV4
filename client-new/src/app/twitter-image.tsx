// Twitter card image. Reuses the opengraph-image renderer so we maintain a
// single visual source of truth. Runtime/size/alt must be re-declared here as
// literals because Next.js parses them statically and can't follow re-exports.
import OgImage, {
  alt as ogAlt,
  size as ogSize,
  contentType as ogContentType,
} from "./opengraph-image";

export const runtime = "edge";
export const alt = ogAlt;
export const size = ogSize;
export const contentType = ogContentType;

export default OgImage;
