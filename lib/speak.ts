// Shared browser text-to-speech for Ti Roulé (chat) and the island guide
// (place stories). Free, on-device. Picks a DIFFERENT voice per language:
// English → an English voice, French & Creole → a French voice (there is no
// Creole TTS, so French is the closest natural fit).

export type SpeechLang = "en" | "fr" | "cr";

const EMOJI = /[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{2190}-\u{21FF}\u{2B00}-\u{2BFF}]/gu;

export function pickVoice(lang: SpeechLang): SpeechSynthesisVoice | null {
  if (typeof window === "undefined" || !window.speechSynthesis) return null;
  const voices = window.speechSynthesis.getVoices();
  const want = lang === "en" ? "en" : "fr";
  const vs = voices.filter((v) => v.lang.toLowerCase().startsWith(want));
  if (!vs.length) return null;
  return (
    vs.find((v) => /google|natural|enhanced|siri|samantha|amelie|amélie|aurélie|aurelie|thomas|sonia|libby|female/i.test(v.name)) ||
    vs.find((v) => !/male/i.test(v.name)) ||
    vs[0]
  );
}

// Warm the voice list (populated asynchronously in most browsers).
export function primeVoices(): void {
  if (typeof window !== "undefined" && window.speechSynthesis) window.speechSynthesis.getVoices();
}

export function speakText(text: string, lang: SpeechLang, onEnd?: () => void): boolean {
  if (typeof window === "undefined" || !window.speechSynthesis) return false;
  const synth = window.speechSynthesis;
  synth.cancel();
  const clean = text.replace(EMOJI, "").replace(/\s+/g, " ").trim();
  if (!clean) return false;
  const u = new SpeechSynthesisUtterance(clean);
  u.lang = lang === "en" ? "en-US" : "fr-FR";
  const v = pickVoice(lang);
  if (v) u.voice = v;
  u.rate = 0.98;
  u.pitch = 1.05;
  if (onEnd) {
    u.onend = onEnd;
    u.onerror = onEnd;
  }
  synth.speak(u);
  return true;
}

export function stopSpeaking(): void {
  if (typeof window !== "undefined" && window.speechSynthesis) window.speechSynthesis.cancel();
}
