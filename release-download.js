// Shared by both public download pages and the publication verifier.
export const VERIFIER = "nilo-full-get-sha256-pe-x64-v1";
export class DownloadError extends Error {
  constructor(code, message) { super(message); this.name = "DownloadError"; this.code = code; }
}
export function validateRelease(release) {
  if (!release || !/^\d+\.\d+\.\d+$/.test(release.version)
      || release.filename !== `NILO-Setup-${release.version}-win-x64.exe`
      || !/^[a-f0-9]{64}$/i.test(release.sha256) || !Number.isSafeInteger(release.bytes)
      || release.bytes < 1024 || release.bytes > 512 * 1048576
      || !Number.isSafeInteger(release.installedBytes) || release.installedBytes <= 0
      || release.packageType !== "installer" || release.selfContained !== true || release.architecture !== "x64"
      || !Array.isArray(release.notes) || !release.notes.every(note => typeof note === "string")
      || typeof release.title !== "string") throw new DownloadError("metadata", "Informasi rilis tidak valid.");
  return release;
}
function safeURL(url, allowLocal = false) {
  if (url.username || url.password || url.hash || (url.protocol !== "https:"
      && !(allowLocal && url.protocol === "http:" && ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname))))
    throw new DownloadError("url", "Alamat unduhan harus HTTPS tanpa kredensial atau fragmen.");
  return url;
}
export function downloadURL(release, metadataURL, allowLocal = false) {
  if (release.downloadUrl !== undefined && (typeof release.downloadUrl !== "string" || !release.downloadUrl.trim()))
    throw new DownloadError("url", "Alamat binary belum dikonfigurasi dengan benar.");
  return safeURL(new URL(release.downloadUrl ?? release.filename, metadataURL), allowLocal);
}
export function validatePE(bytes) {
  if (bytes.length < 64) throw new DownloadError("binary", "File unduhan bukan installer Windows.");
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const pe = view.getUint32(0x3c, true);
  if (view.getUint16(0, true) !== 0x5a4d || pe < 64 || pe > bytes.length - 26
      || view.getUint32(pe, true) !== 0x4550 || view.getUint16(pe + 4, true) !== 0x8664
      || !(view.getUint16(pe + 22, true) & 2) || (view.getUint16(pe + 22, true) & 0x2000))
    throw new DownloadError("binary", "File unduhan bukan installer Windows x64.");
}
export function validateReceipt(receipt, release, url) {
  if (!receipt || receipt.status !== "verified" || receipt.schemaVersion !== 1 || receipt.verifier !== VERIFIER
      || receipt.version !== release.version || receipt.filename !== release.filename
      || receipt.bytes !== release.bytes || receipt.sha256?.toLowerCase() !== release.sha256.toLowerCase()
      || receipt.downloadUrl !== url.href || !Number.isFinite(Date.parse(receipt.verifiedAt)))
    throw new DownloadError("verification", "Sumber unduhan belum lolos verifikasi publikasi.");
  safeURL(new URL(receipt.finalUrl), ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname));
  return receipt;
}
async function readJSON(fetchImpl, url, signal) {
  const response = await fetchImpl(url.href, { cache: "no-store", credentials: "same-origin", signal });
  if (!response.ok) throw new DownloadError("metadata", "Informasi rilis belum dapat diakses.");
  // Never follow a metadata/receipt redirect to an unconfigured cross-origin source.
  if (response.url && new URL(response.url).origin !== url.origin)
    throw new DownloadError("metadata", "Sumber informasi rilis berpindah ke situs lain.");
  return response.json();
}
async function prefix(response) {
  if (!response.body) throw new DownloadError("binary", "Isi installer tidak dapat dibaca.");
  const reader = response.body.getReader(); const chunks = []; let size = 0;
  try {
    while (size < 65536) {
      const { value, done } = await reader.read(); if (done) break;
      const part = value.subarray(0, 65536 - size); chunks.push(part); size += part.length;
    }
  } finally { await reader.cancel().catch(() => {}); }
  const result = new Uint8Array(size); let offset = 0;
  for (const part of chunks) { result.set(part, offset); offset += part.length; }
  return result;
}
export async function loadVerifiedRelease({ metadataURL, fetchImpl = globalThis.fetch, signal, onRelease = () => {} }) {
  const metadata = new URL(metadataURL);
  const local = ["localhost", "127.0.0.1", "[::1]"].includes(metadata.hostname);
  const release = validateRelease(await readJSON(fetchImpl, metadata, signal));
  const url = downloadURL(release, metadata, local);
  onRelease(release);
  let receipt = null, published;
  try { published = await readJSON(fetchImpl, new URL("download-verification.json", metadata), signal); }
  catch (error) { if (signal?.aborted) throw error; }
  if (published?.status === "unavailable" && published.version === release.version && published.downloadUrl === url.href
      && published.bytes === release.bytes && published.sha256?.toLowerCase() === release.sha256.toLowerCase())
    throw new DownloadError("verification", "Verifikasi installer saat publikasi gagal. Tunggu file yang sesuai sebelum mengunduh.");
  if (published?.status === "verified") {
    try { receipt = validateReceipt(published, release, url); }
    catch (error) {
      if (published.downloadUrl === url.href) throw error; // Never bypass a failed hash/identity check for this target.
    }
  }
  if (url.origin !== metadata.origin) {
    // A normal link can download a public release asset without browser fetch/CORS.
    // Its full bytes/hash/PE must first be verified by the publication command.
    if (!receipt) throw new DownloadError("verification", "Sumber unduhan eksternal belum terverifikasi. Coba lagi setelah publikasi selesai.");
    return { release, url, verification: "published-full-download", receipt };
  }
  if (receipt && new URL(receipt.finalUrl).origin !== metadata.origin)
    return { release, url, verification: "published-full-download", receipt };
  let response;
  const requestBinary = range => fetchImpl(url.href, { method: "GET", ...(range ? { headers: { Range: "bytes=0-65535" } } : {}),
    cache: "no-store", credentials: "same-origin", signal, redirect: "error" });
  try {
    // GET a bounded binary prefix, not HEAD. Some hosts/CDNs reject HEAD or use a
    // nonstandard EXE MIME type even when the real GET is valid.
    response = await requestBinary(true);
    if ([400,405,416,501].includes(response.status)) {
      // Range support is optional. Retry the same configured URL once with an
      // ordinary GET, then apply the same size and actual executable checks.
      await response.body?.cancel().catch(() => {});
      response = await requestBinary(false);
    }
  } catch (error) {
    if (signal?.aborted) throw error;
    throw new DownloadError("network", "Installer belum dapat diperiksa. Periksa koneksi atau konfigurasi sumber unduhan.");
  }
  try {
    if (response.status !== 200 && response.status !== 206) throw new DownloadError("unavailable", "Installer belum dapat diakses. Coba lagi setelah file selesai dipublikasikan.");
    let total = null, expectedPrefix = Math.min(65536, release.bytes);
    if (response.status === 206) {
      const match = /^bytes 0-(\d+)\/(\d+)$/.exec(response.headers.get("content-range") || "");
      if (!match || Number(match[1]) < 63) throw new DownloadError("size", "Respons ukuran installer tidak valid.");
      const end = Number(match[1]); total = Number(match[2]);
      if (!Number.isSafeInteger(end) || !Number.isSafeInteger(total) || end >= total)
        throw new DownloadError("size", "Rentang byte installer tidak valid.");
      expectedPrefix = Math.min(65536, end + 1);
    } else if (response.headers.has("content-length") && (response.headers.get("content-encoding") || "identity").trim().toLowerCase() === "identity") {
      total = Number(response.headers.get("content-length"));
    }
    if (total !== null && total !== release.bytes) throw new DownloadError("size", "Ukuran installer berbeda dari informasi rilis.");
    if (total === null && !receipt) throw new DownloadError("verification", "Ukuran installer belum dapat diverifikasi. Sumber unduhan perlu diperiksa saat publikasi.");
    const bytes = await prefix(response);
    if (bytes.length !== expectedPrefix) throw new DownloadError("size", "Isi installer terpotong saat diperiksa. Coba lagi setelah file selesai dipublikasikan.");
    validatePE(bytes);
    return { release, url, verification: "binary-prefix-and-size", receipt };
  } finally { if (!response.bodyUsed) await response.body?.cancel().catch(() => {}); }
}
export function setupDownloads({ document = globalThis.document, metadataURL = new URL("aplikasi/release.json", globalThis.location.href),
  fetchImpl = globalThis.fetch, onRelease = () => {}, onError = () => {} } = {}) {
  const buttons = [...document.querySelectorAll(".js-download")];
  const status = document.querySelector("#release-status"), retry = document.querySelector("#release-retry");
  let generation = 0, active;
  async function reload() {
    const version = ++generation; active?.abort(); active = new AbortController();
    const request = active; const timeout = setTimeout(() => request.abort(), 30000); const signal = request.signal;
    buttons.forEach(button => { button.removeAttribute("href"); button.removeAttribute("download"); button.setAttribute("aria-disabled", "true"); button.setAttribute("aria-busy", "true"); });
    document.querySelectorAll(".download-label").forEach(label => { label.textContent = "Memeriksa installer…"; });
    retry.hidden = true; status.classList.remove("is-error"); status.textContent = "Memeriksa installer…";
    delete status.dataset.reason; let release;
    try {
      const verified = await loadVerifiedRelease({ metadataURL, fetchImpl, signal, onRelease(value) {
        if (version !== generation) return; release = value; onRelease(value);
      } });
      if (version !== generation) return;
      buttons.forEach(button => {
        button.href = verified.url.href;
        if (verified.url.origin === new URL(metadataURL).origin) button.download = release.filename;
        button.setAttribute("aria-disabled", "false");
      });
      document.querySelectorAll(".download-label").forEach(label => { label.textContent = "Unduh installer .exe"; });
      status.textContent = `${formatSize(release.bytes)} · v${release.version} · Runtime disertakan`;
      status.dataset.verification = verified.verification;
      return verified;
    } catch (error) {
      if (version !== generation) return;
      status.dataset.reason = error.code || "network"; delete status.dataset.verification;
      document.querySelectorAll(".download-label").forEach(label => { label.textContent = "Installer belum tersedia"; });
      status.textContent = globalThis.location?.protocol === "file:" ? "Buka melalui server lokal, atau buka installer dari folder aplikasi."
        : error instanceof DownloadError ? error.message : "Pemeriksaan installer gagal. Periksa koneksi dan coba lagi.";
      status.classList.add("is-error"); retry.hidden = false; onError(error, release);
    } finally {
      clearTimeout(timeout);
      if (version === generation) buttons.forEach(button => button.setAttribute("aria-busy", "false"));
    }
  }
  retry.addEventListener("click", reload);
  return { reload, ready: reload() };
}
export const formatSize = bytes => `${(bytes / 1048576).toLocaleString("id-ID", { maximumFractionDigits: 1 })} MB`;
