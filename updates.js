import { setupDownloads } from "./release-download.js?v=download-fix-2";

export const downloads = setupDownloads({ onRelease(release) {
  document.querySelectorAll("[data-version]").forEach(element => { element.textContent = `v${release.version}`; });
} });
