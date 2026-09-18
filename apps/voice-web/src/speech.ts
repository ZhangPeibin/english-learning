export type SpeechLanguage = "en-US" | "zh-CN";
export interface SpeechSegment { text: string; language: SpeechLanguage }

const han = /\p{Script=Han}/u;
const latinOrNumber = /[\p{Script=Latin}\p{Number}]/u;

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
