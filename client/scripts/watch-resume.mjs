import { watch } from "chokidar";
import { execSync } from "child_process";
import { existsSync, unlinkSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const publicDir = resolve(__dirname, "../public");
const texFile = resolve(publicDir, "resume.tex");

const auxExtensions = [".aux", ".log", ".out", ".fls", ".fdb_latexmk", ".synctex.gz"];

function cleanAuxFiles() {
  for (const ext of auxExtensions) {
    const auxFile = resolve(publicDir, `resume${ext}`);
    if (existsSync(auxFile)) {
      unlinkSync(auxFile);
    }
  }
}

function compileResume() {
  console.log(`[${new Date().toLocaleTimeString()}] Detected change in resume.tex, recompiling...`);

  try {
    execSync(`pdflatex -interaction=nonstopmode -output-directory="${publicDir}" "${texFile}"`, {
      stdio: "pipe",
      cwd: publicDir,
    });
    console.log(`[${new Date().toLocaleTimeString()}] Resume compiled successfully.`);
  } catch (error) {
    console.error(`[${new Date().toLocaleTimeString()}] Compilation failed:`);
    console.error(error.stdout?.toString() || error.message);
  } finally {
    cleanAuxFiles();
  }
}

console.log("Watching resume.tex for changes...");

const watcher = watch(texFile, {
  persistent: true,
  ignoreInitial: true,
  awaitWriteFinish: {
    stabilityThreshold: 500,
    pollInterval: 100,
  },
});

watcher.on("change", compileResume);
