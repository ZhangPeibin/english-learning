export type SpeechLanguage = "en-US" | "zh-CN";
export interface SpeechSegment { text: string; language: SpeechLanguage }
export interface VoiceDescriptor { name: string; lang: string }

const han = /\p{Script=Han}/u;
const latinOrNumber = /[\p{Script=Latin}\p{Number}]/u;
const preferredNames: Record<SpeechLanguage, string[]> = {
  "en-US": ["Samantha", "Daniel", "Karen", "Moira", "Google US English"],
  "zh-CN": ["婷婷", "Tingting", "美嘉", "Meijia", "Sinji"]
};

export function speechSegments(text: string): SpeechSegment[] {
  const segments: SpeechSegment[] = [];
  for (const character of text) {
    const current = segments.at(-1);
    const language: SpeechLanguage = han.test(character)
      ? "zh-CN"
      : latinOrNumber.test(character)
        ? "en-US"
        : current?.language ?? "en-US";
    if (current?.language === language) current.text += character;
    else segments.push({ text: character, language });
  }
  return segments.filter((segment) => segment.text.trim());
}

export function voicesForLanguage<T extends VoiceDescriptor>(voices: T[], language: SpeechLanguage): T[] {
  const prefix = language.slice(0, 2).toLowerCase();
  return voices
    .filter((voice) => voice.lang.toLowerCase().startsWith(prefix))
    .sort((left, right) => voiceRank(left, language) - voiceRank(right, language)
      || left.name.localeCompare(right.name));
}

export function preferredVoice<T extends VoiceDescriptor>(
  voices: T[], language: SpeechLanguage, selectedName?: string | null
): T | null {
  const matches = voicesForLanguage(voices, language);
  return matches.find((voice) => voice.name === selectedName) ?? matches[0] ?? null;
}

function voiceRank(voice: VoiceDescriptor, language: SpeechLanguage): number {
  const preferred = preferredNames[language].indexOf(voice.name);
  if (preferred >= 0) return preferred;
  return 100 + (voice.lang.toLowerCase() === language.toLowerCase() ? 0 : 10);
}
