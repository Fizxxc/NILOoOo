import { startIntro } from "./intro.js";
startIntro();
import { setupDownloads, formatSize } from "./release-download.js?v=download-fix-2";
const $ = (selector) => document.querySelector(selector);
const gallery = {
  hub: ["Ringkasan NILO", "Lihat yang sedang berjalan.", "Ringkasan musik, sisa waktu fokus, dan jumlah air hari ini. Arahkan kursor ke notch untuk membuka; jauhkan untuk menutup otomatis."],
  player: ["Pemutar musik NILO", "Kontrol musik dari notch.", "Jeda, lanjut, dan pindah lagu tanpa berpindah jendela. Tangkapan ini memperlihatkan keadaan kosong saat tidak ada sesi media aktif."],
  lyrics: ["Lirik NILO", "Lirik mengikuti lagu.", "Lirik tersinkron diambil dari LRCLIB ketika tersedia. Isi dan sinkronisasi bergantung pada metadata lagu serta data penyedia."],
  focus: ["Timer fokus NILO", "Sesi fokus, langsung terlihat.", "Jalankan Pomodoro dari panel fokus. Sisa waktu dapat dilihat kembali melalui ringkasan NILO."],
  water: ["Catatan air NILO", "Catat air minum harian.", "Sapaan harian dan pengingat 45 menit. Konfirmasi +250 ml setelah minum, atau tunda 10 menit. Data disimpan lokal di komputer."],
  shelf: ["File Shelf NILO", "Tempat sementara untuk file.", "Seret file atau folder ke notch. Buka atau tarik keluar saat dibutuhkan. Penghapusan item Shelf tidak menghapus file asli."]
};
const tabs = [...document.querySelectorAll('[role="tab"]')];
let activeView = "hub";
function selectTab(tab, focus = false) {
  const view = tab.dataset.view;
  if (!gallery[view]) return;
  activeView = view;
  tabs.forEach((item) => { const selected = item === tab; item.setAttribute("aria-selected", String(selected)); item.tabIndex = selected ? 0 : -1; });
  $("#gallery-detail").setAttribute("aria-labelledby", tab.id);
  $("#product-shot").src = `assets/app-${view}.png`;
  $("#product-shot").alt = gallery[view][0];
  $("#gallery-title").textContent = gallery[view][1];
  $("#gallery-description").textContent = gallery[view][2];
  $("#gallery-index").textContent = `${String(tabs.indexOf(tab) + 1).padStart(2, "0")} / 06`;
  if (focus) tab.focus();
}
tabs.forEach((tab, index) => {
  tab.addEventListener("click", () => selectTab(tab));
  tab.addEventListener("keydown", (event) => {
    const destination = { ArrowRight: (index + 1) % tabs.length, ArrowLeft: (index + tabs.length - 1) % tabs.length, Home: 0, End: tabs.length - 1 }[event.key];
    if (destination !== undefined) { event.preventDefault(); selectTab(tabs[destination], true); }
  });
});
const dialog = $("#screenshot-dialog");
$("#screenshot-open").addEventListener("click", () => { $("#screenshot-title").textContent = gallery[activeView][0]; $("#dialog-shot").src = `assets/app-${activeView}.png`; $("#dialog-shot").alt = gallery[activeView][0]; dialog.showModal(); });
$("#screenshot-close").addEventListener("click", () => dialog.close());
dialog.addEventListener("click", (event) => { const box = dialog.getBoundingClientRect(); if (event.target === dialog && (event.clientX < box.left || event.clientX > box.right || event.clientY < box.top || event.clientY > box.bottom)) dialog.close(); });
let releaseHash = "";
export const downloads = setupDownloads({ onRelease(release) {
  $("#latest-update-title").textContent = `NILO ${release.version} - ${release.title}`;
  $("#latest-update-date").textContent = release.publishedAt;
  $("#latest-update-notes").replaceChildren(...release.notes.map(note => { const item = document.createElement("li"); item.textContent = note; return item; }));
  document.querySelectorAll("[data-version]").forEach(element => { element.textContent = `v${release.version}`; });
  $("#release-size").textContent = formatSize(release.bytes);
  $("#installed-size").textContent = formatSize(release.installedBytes);
  $("#release-filename").textContent = release.filename;
  releaseHash = release.sha256.toUpperCase(); $("#release-hash").textContent = releaseHash; $("#copy-hash").disabled = false;
}, onError(error, release) {
  if (release) return; // Valid release details remain readable while binary availability fails.
  $("#copy-hash").disabled = true; releaseHash = "";
  for (const id of ["release-size", "installed-size", "release-filename", "release-hash"]) $(`#${id}`).textContent = "Belum tersedia";
  document.querySelectorAll("[data-version]").forEach(element => { element.textContent = "-"; });
} });
$("#copy-hash").addEventListener("click", async () => {
  if (!releaseHash) return;
  try { await navigator.clipboard.writeText(releaseHash); $("#copy-status").textContent = "SHA-256 tersalin."; }
  catch { const selection = window.getSelection(); const range = document.createRange(); range.selectNodeContents($("#release-hash")); selection.removeAllRanges(); selection.addRange(range); $("#copy-status").textContent = "Teks dipilih. Tekan Ctrl+C."; }
});
