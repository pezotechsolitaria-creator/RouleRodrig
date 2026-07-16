// Shared browser text-to-speech for Ti Roulé (chat) and the island guide
// (place stories). Free, on-device. Picks a DIFFERENT voice per language:
// English → an English voice, French & Creole → a French voice (there is no
// Creole TTS, so French is the closest natural fit).
//
// Robustness: keeps a live reference to the current utterance (browsers GC it
// mid-speech otherwise, which cuts the audio off), and nudges Chrome to resume
// (it silently pauses long utterances after ~15s).

export type SpeechLang = "en" | "fr" | "cr";

const EMOJI = /[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{2190}-\u{21FF}\u{2B00}-\u{2BFF}]/gu;

let current: SpeechSynthesisUtterance | null = null;
let keepAlive: ReturnType<typeof setInterval> | null = null;

function clearKeepAlive() {
  if (keepAlive) { clearInterval(keepAlive); keepAlive = null; }
}

export function pickVoice(lang: SpeechLang): SpeechSynthesisVoice | null {
  if (typeof window === "undefined" || !window.speechSynthesis) return null;
  const voices = window.speechSynthesis.getVoices();
  if (!voices.length) return null;
  const norm = (v: SpeechSynthesisVoice) => v.lang.toLowerCase().replace("_", "-");
  // English → an English voice. French AND Creole → a French voice (no browser
  // or OS ships a Mauritian Creole voice; French is by far the closest match).
  const prefix = lang === "en" ? "en" : "fr";
  const exact = lang === "en" ? "en-us" : "fr-fr";
  const all = voices.filter((v) => norm(v).startsWith(prefix));
  if (!all.length) return null;
  const pool = all.filter((v) => norm(v).startsWith(exact));
  const vs = pool.length ? pool : all;
  return (
    vs.find((v) => /google|natural|enhanced|siri|samantha|amelie|amélie|aurélie|aurelie|thomas|sonia|libby|female/i.test(v.name)) ||
    vs.find((v) => !/male/i.test(v.name)) ||
    vs[0]
  );
}

// Warm the voice list (populated asynchronously in most browsers, incl. iOS).
export function primeVoices(): void {
  if (typeof window === "undefined" || !window.speechSynthesis) return;
  window.speechSynthesis.getVoices();
}

export function speakText(text: string, lang: SpeechLang, onEnd?: () => void): boolean {
  if (typeof window === "undefined" || !window.speechSynthesis) return false;
  const synth = window.speechSynthesis;
  clearKeepAlive();
  current = null;
  synth.cancel();

  const clean = text.replace(EMOJI, "").replace(/\s+/g, " ").trim();
  if (!clean) return false;

  const u = new SpeechSynthesisUtterance(clean);
  u.lang = lang === "en" ? "en-US" : "fr-FR";
  const v = pickVoice(lang);
  if (v) u.voice = v;
  u.rate = 0.98;
  u.pitch = 1.05;
  const finish = () => { clearKeepAlive(); current = null; onEnd?.(); };
  u.onend = finish;
  u.onerror = finish;

  current = u; // keep a live reference so the browser doesn't GC it mid-speech
  synth.speak(u);

  // Chrome pauses long speech after ~15s — a periodic resume keeps it going.
  keepAlive = setInterval(() => {
    if (synth.speaking) synth.resume();
    else clearKeepAlive();
  }, 8000);

  return true;
}

export function stopSpeaking(): void {
  if (typeof window !== "undefined" && window.speechSynthesis) window.speechSynthesis.cancel();
  clearKeepAlive();
  current = null;
}
