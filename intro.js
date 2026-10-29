// Decorative, bounded intro. Downloads and gallery initialize independently.
export function startIntro({ document = globalThis.document, environment = globalThis } = {}) {
  const intro = document.querySelector("#site-intro");
  if (!intro) return () => {};
  if (typeof environment.matchMedia !== "function") { intro.hidden = true; return () => {}; }
  const preference = environment.matchMedia("(prefers-reduced-motion: reduce)");
  let timer, finished = false;
  const image = intro.querySelector("img");
  function finish() {
    if (finished) return; finished = true; intro.hidden = true;
    if (timer !== undefined) environment.clearTimeout(timer);
    document.removeEventListener("keydown", keydown, true);
    document.removeEventListener("visibilitychange", visibilityChanged);
    environment.removeEventListener("pagehide", finish);
    preference.removeEventListener?.("change", motionChanged);
    intro.removeEventListener("pointerdown", finish);
    document.querySelector("#intro-skip")?.removeEventListener("click", finish);
    image?.removeEventListener("error", finish);
    // Release the native animated image after its one playback.
    if (image) image.src = "logo-anim/logo-intro-poster.png";
  }
  function keydown(event) { if (event.key === "Escape") event.preventDefault(); finish(); }
  function visibilityChanged() { if (document.hidden) finish(); }
  function motionChanged(event) { if (event.matches) finish(); }
  if (preference.matches || document.hidden) { finish(); return finish; }
  intro.addEventListener("pointerdown", finish);
  document.querySelector("#intro-skip")?.addEventListener("click", finish);
  image?.addEventListener("error", finish);
  document.addEventListener("keydown", keydown, true);
  document.addEventListener("visibilitychange", visibilityChanged);
  environment.addEventListener("pagehide", finish);
  preference.addEventListener?.("change", motionChanged);
  timer = environment.setTimeout(finish, 2800);
  return finish;
}
