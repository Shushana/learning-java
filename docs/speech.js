// Text-to-speech (judge + bots) and speech-to-text (your answers), French.

let voices = [];
function loadVoices() {
  voices = speechSynthesis.getVoices().filter((v) => v.lang && v.lang.toLowerCase().startsWith("fr"));
}
if ("speechSynthesis" in window) {
  loadVoices();
  speechSynthesis.onvoiceschanged = loadVoices;
}

function pickVoice(index) {
  if (!voices.length) loadVoices();
  // Prefer France French, then any French voice.
  const frFR = voices.filter((v) => v.lang.toLowerCase() === "fr-fr");
  const pool = frFR.length ? frFR : voices;
  return pool.length ? pool[index % pool.length] : null;
}

// iOS only lets audio start inside a tap. Call this from a tap handler once.
export function unlockAudio() {
  if (!("speechSynthesis" in window)) return;
  const u = new SpeechSynthesisUtterance(" ");
  u.volume = 0;
  speechSynthesis.speak(u);
}

export function stopSpeaking() {
  if ("speechSynthesis" in window) speechSynthesis.cancel();
}

// voiceIndex: 0 = judge, 1.. = bots. Resolves when speech ends.
export function speak(text, { rate = 0.85, pitch = 1, voiceIndex = 0 } = {}) {
  return new Promise((resolve) => {
    if (!("speechSynthesis" in window) || !text) return resolve();
    const u = new SpeechSynthesisUtterance(text);
    u.lang = "fr-FR";
    u.rate = rate;
    u.pitch = pitch;
    const v = pickVoice(voiceIndex);
    if (v) u.voice = v;
    u.onend = u.onerror = () => resolve();
    speechSynthesis.speak(u);
  });
}

const Recognition = window.SpeechRecognition || window.webkitSpeechRecognition;
export const canListen = !!Recognition;

// Starts listening; onText(fullTranscript, isFinal). Returns a stop() function.
export function listen(onText, onEnd) {
  const r = new Recognition();
  r.lang = "fr-FR";
  r.interimResults = true;
  r.continuous = true;
  let finalText = "";
  r.onresult = (e) => {
    let interim = "";
    for (let i = e.resultIndex; i < e.results.length; i++) {
      const t = e.results[i][0].transcript;
      if (e.results[i].isFinal) finalText += t + " ";
      else interim += t;
    }
    onText((finalText + interim).trim());
  };
  r.onerror = (e) => onEnd(e.error);
  r.onend = () => onEnd();
  r.start();
  return () => r.stop();
}

// Rough word-overlap score for the "repeat after me" drill.
export function similarity(target, said) {
  const norm = (s) =>
    s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9' ]/g, " ").split(/\s+/).filter(Boolean);
  const t = norm(target);
  const s = new Set(norm(said));
  if (!t.length) return 0;
  return Math.round((t.filter((w) => s.has(w)).length / t.length) * 100);
}
