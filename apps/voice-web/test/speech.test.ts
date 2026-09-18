import { describe, expect, test } from "vitest";
import { preferredVoice, speechSegments, voicesForLanguage } from "../src/speech";

describe("speechSegments", () => {
  test("keeps English and Chinese replies with their native speech languages", () => {
    expect(speechSegments("Hello，你好！How are you? 我很好。"))
      .toEqual([
        { text: "Hello，", language: "en-US" },
        { text: "你好！", language: "zh-CN" },
        { text: "How are you? ", language: "en-US" },
        { text: "我很好。", language: "zh-CN" }
      ]);
  });

  test.each([
    ["Practice makes progress.", "en-US"],
    ["继续加油。", "zh-CN"]
  ])("uses one voice for a single-language reply", (text, language) => {
    expect(speechSegments(text)).toEqual([{ text, language }]);
  });
});

describe("voice selection", () => {
  const voices = [
    { name: "Albert", lang: "en-US" },
    { name: "Samantha", lang: "en-US" },
    { name: "Eddy (中文（中国大陆）)", lang: "zh-CN" },
    { name: "婷婷", lang: "zh-CN" },
    { name: "美嘉", lang: "zh-TW" }
  ];

  test("prefers natural teaching voices over the browser list order", () => {
    expect(preferredVoice(voices, "en-US")?.name).toBe("Samantha");
    expect(preferredVoice(voices, "zh-CN")?.name).toBe("婷婷");
  });

  test("honors a saved voice and keeps same-language regional options", () => {
    expect(preferredVoice(voices, "zh-CN", "美嘉")?.name).toBe("美嘉");
    expect(voicesForLanguage(voices, "zh-CN").map((voice) => voice.name)).toContain("美嘉");
  });
});
