"use strict";
const $ = (selector) => document.querySelector(selector);
const gallery = {
  hub: ["Ringkasan NILO", "Lihat yang sedang berjalan.", "Ringkasan musik, sisa waktu fokus, dan jumlah air hari ini. Arahkan kursor ke notch untuk membuka; jauhkan untuk menutup otomatis."],
  player: ["Pemutar musik NILO", "Kontrol musik dari notch.", "Jeda, lanjut, dan pindah lagu tanpa berpindah jendela. Tangkapan ini memperlihatkan keadaan kosong saat tidak ada sesi media aktif."],
  lyrics: ["Lirik NILO", "Lirik mengikuti lagu.", "Lirik tersinkron diambil dari LRCLIB ketika tersedia. Isi dan sinkronisasi bergantung pada metadata lagu serta data penyedia."],
  focus: ["Timer fokus NILO", "Sesi fokus, langsung terlihat.", "Jalankan Pomodoro dari panel fokus. Sisa waktu dapat dilihat kembali melalui ringkasan NILO."],
  water: ["Catatan air NILO", "Catat air minum harian.", "Tentukan target, tambahkan jumlah air yang diminum, dan atur pengingat. Data disimpan lokal di komputer."],
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
async function loadRelease() {
  const buttons = [...document.querySelectorAll(".js-download")];
  for (const button of buttons) { button.removeAttribute("href"); button.removeAttribute("download"); button.setAttribute("aria-disabled", "true"); }
  $("#release-retry").hidden = true; $("#release-status").classList.remove("is-error"); $("#release-status").textContent = "Memeriksa installer…";
  document.querySelectorAll(".download-label").forEach((element) => { element.textContent = "Memeriksa installer…"; });
  try {
    const response = await fetch("aplikasi/release.json", { cache: "no-store", signal: AbortSignal.timeout(15000) });
    if (!response.ok) throw new Error("Release unavailable");
    const release = await response.json();
    if (!/^\d+\.\d+\.\d+$/.test(release.version) || !/^NILO-Setup-\d+\.\d+\.\d+-win-x64\.exe$/.test(release.filename) || !/^[a-f0-9]{64}$/i.test(release.sha256) || !Number.isSafeInteger(release.bytes) || release.bytes <= 0 || !Number.isSafeInteger(release.installedBytes) || release.installedBytes <= 0 || release.packageType !== "installer" || release.selfContained !== true) throw new Error("Invalid release");
    const fileURL = `aplikasi/${release.filename}`;
    const file = await fetch(fileURL, { method: "HEAD", cache: "no-store", signal: AbortSignal.timeout(15000) });
    if (!file.ok || !/^application\/(octet-stream|x-msdownload|vnd\.microsoft\.portable-executable)(;|$)/i.test(file.headers.get("content-type") || "")) throw new Error("Installer unavailable");
    const length = file.headers.get("content-length"); if (length !== null && Number(length) !== release.bytes) throw new Error("Installer size mismatch");
    const size = (bytes) => `${(bytes / 1048576).toLocaleString("id-ID", { maximumFractionDigits: 1 })} MB`;
    if (!Array.isArray(release.notes) || !release.notes.every(note => typeof note === 'string') || typeof release.title !== 'string') throw new Error('Missing release notes');
    $("#latest-update-title").textContent = `NILO ${release.version} — ${release.title}`;
    $("#latest-update-date").textContent = release.publishedAt;
    $("#latest-update-notes").replaceChildren(...release.notes.map(note => { const item = document.createElement('li'); item.textContent = note; return item; }));
    document.querySelectorAll("[data-version]").forEach((element) => { element.textContent = `v${release.version}`; });
    $("#release-size").textContent = size(release.bytes); $("#installed-size").textContent = size(release.installedBytes); $("#release-filename").textContent = release.filename;
    releaseHash = release.sha256.toUpperCase(); $("#release-hash").textContent = releaseHash; $("#copy-hash").disabled = false;
    for (const button of buttons) { button.href = fileURL; button.download = release.filename; button.setAttribute("aria-disabled", "false"); }
    document.querySelectorAll(".download-label").forEach((element) => { element.textContent = "Unduh installer .exe"; });
    $("#release-status").textContent = `${size(release.bytes)} · v${release.version} · Runtime disertakan`;
  } catch {
    document.querySelectorAll(".download-label").forEach((element) => { element.textContent = "Installer belum tersedia"; });
    $("#release-status").textContent = location.protocol === "file:" ? "Buka melalui server lokal, atau buka installer dari folder aplikasi." : "Installer belum dapat diakses. Coba lagi atau hubungi pengembang.";
    $("#release-status").classList.add("is-error"); $("#release-retry").hidden = false; $("#copy-hash").disabled = true; releaseHash = "";
    for (const id of ["release-size", "installed-size", "release-filename", "release-hash"]) $(`#${id}`).textContent = "Belum tersedia";
    document.querySelectorAll("[data-version]").forEach((element) => { element.textContent = "—"; });
  }
}
$("#release-retry").addEventListener("click", loadRelease);
$("#copy-hash").addEventListener("click", async () => {
  if (!releaseHash) return;
  try { await navigator.clipboard.writeText(releaseHash); $("#copy-status").textContent = "SHA-256 tersalin."; }
  catch { const selection = window.getSelection(); const range = document.createRange(); range.selectNodeContents($("#release-hash")); selection.removeAllRanges(); selection.addRange(range); $("#copy-status").textContent = "Teks dipilih. Tekan Ctrl+C."; }
});
loadRelease();
