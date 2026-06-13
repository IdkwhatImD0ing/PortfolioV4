import { execSync } from "child_process";
import { existsSync, unlinkSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const publicDir = resolve(__dirname, "../public");
const texFile = resolve(publicDir, "resume.tex");

// Auxiliary file extensions that pdflatex generates
const auxExtensions = [".aux", ".log", ".out", ".fls", ".fdb_latexmk", ".synctex.gz"];

function cleanAuxFiles() {
  for (const ext of auxExtensions) {
    const auxFile = resolve(publicDir, `resume${ext}`);
    if (existsSync(auxFile)) {
      unlinkSync(auxFile);
    }
  }
}

function hasPdflatex() {
  try {
    execSync("pdflatex --version", { stdio: "pipe" });
    return true;
  } catch {
    return false;
  }
}

function compileResume() {
  if (!existsSync(texFile)) {
    console.error("resume.tex not found at", texFile);
    process.exit(1);
  }

  if (!hasPdflatex()) {
    const pdfFile = resolve(publicDir, "resume.pdf");
    if (existsSync(pdfFile)) {
      console.log("pdflatex not found, using pre-compiled resume.pdf.");
      return;
    }
    console.error("pdflatex not found and no pre-compiled resume.pdf exists.");
    process.exit(1);
  }

  console.log("Compiling resume.tex -> resume.pdf ...");

  try {
    execSync(`pdflatex -interaction=nonstopmode -output-directory="${publicDir}" "${texFile}"`, {
      stdio: "pipe",
      cwd: publicDir,
    });
    console.log("Resume compiled successfully.");
  } catch (error) {
    console.error("pdflatex compilation failed:");
    console.error(error.stdout?.toString() || error.message);
    process.exit(1);
  } finally {
    cleanAuxFiles();
  }
}

compileResume();
