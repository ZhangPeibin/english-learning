import { describe, expect, test } from "vitest";
import { speechSegments } from "../src/speech";

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
