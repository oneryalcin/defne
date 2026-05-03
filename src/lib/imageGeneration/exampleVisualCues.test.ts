import { Buffer } from "node:buffer";
import { describe, expect, it } from "vitest";
import {
  buildExampleVisualCuePrompt,
  generateExampleVisualCue,
  generateExampleVisualCueBatch,
  stablePromptDigest,
  type ExampleVisualCueInput
} from "./exampleVisualCues";

const INPUT: ExampleVisualCueInput = {
  exampleId: "example_word_reluctant_0",
  wordId: "word_reluctant",
  word: "reluctant",
  definition: "unwilling or hesitant",
  sentence: "Defne was reluctant to speak in front of the class, even though she had prepared well.",
  confusables: ["reticent"],
  useDefneCharacter: true
};

describe("example visual cue generation", () => {
  it("builds a reusable sketch-watercolour prompt around the example", () => {
    const prompt = buildExampleVisualCuePrompt(INPUT);

    expect(prompt).toContain('vocabulary word "reluctant"');
    expect(prompt).toContain('meaning "unwilling or hesitant". This image');
    expect(prompt).toContain(INPUT.sentence);
    expect(prompt).toContain("Graphite pencil line work dominates");
    expect(prompt).toContain("delicate crosshatching");
    expect(prompt).toContain("muted olive");
    expect(prompt).toContain("25-35% saturation");
    expect(prompt).toContain("No inset panels");
    expect(prompt).toContain("No writing");
    expect(prompt).toContain("digital glossy finish");
    expect(prompt).toContain("reticent");
  });

  it("tightens scene focus for railway plant-growth examples", () => {
    const prompt = buildExampleVisualCuePrompt({
      exampleId: "example_word_verdant_2",
      wordId: "word_verdant",
      word: "verdant",
      definition: "green with healthy plant growth",
      sentence:
        "During the walk, we passed an abandoned railway platform where wildflowers grew between the rails and rabbits made tunnels in the soil."
    });

    expect(prompt).toContain("plant growth reclaiming the railway is the subject");
    expect(prompt).toContain("Do not turn this into a broad landscape");
  });

  it("bans readable text for examples with display-like objects", () => {
    const prompt = buildExampleVisualCuePrompt({
      exampleId: "example_word_dimension_1",
      wordId: "word_dimension",
      word: "dimension",
      definition: "A measurement in one direction; also a particular aspect of something.",
      sentence:
        "When the museum showed maps of another dimension of history, pupils saw how people's homes and clothes changed over hundreds of years."
    });

    expect(prompt).toContain("must be blank, turned away, cropped, or reduced to unreadable pencil texture");
    expect(prompt).toContain("Never add readable letters");
  });

  it("keeps prompt digests stable", () => {
    const prompt = buildExampleVisualCuePrompt(INPUT);

    expect(stablePromptDigest(prompt)).toHaveLength(12);
    expect(stablePromptDigest(prompt)).toBe(stablePromptDigest(prompt));
  });

  it("calls Gemini asynchronously and extracts inline image data", async () => {
    const fetchCalls: unknown[] = [];
    const fetchImpl: typeof fetch = async (_url, init) => {
      fetchCalls.push(JSON.parse(String(init?.body)));
      return new Response(
        JSON.stringify({
          candidates: [
            {
              content: {
                parts: [
                  { text: "Generated." },
                  { inlineData: { mimeType: "image/jpeg", data: Buffer.from("image-bytes").toString("base64") } }
                ]
              }
            }
          ]
        }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      );
    };

    const cue = await generateExampleVisualCue(INPUT, {
      apiKey: "test-key",
      fetchImpl,
      model: "test-image-model"
    });

    expect(cue.model).toBe("test-image-model");
    expect(cue.mimeType).toBe("image/jpeg");
    expect(Buffer.from(cue.imageBase64, "base64").toString("utf8")).toBe("image-bytes");
    expect(fetchCalls).toHaveLength(1);
    expect(fetchCalls[0]).toMatchObject({
      generationConfig: {
        responseModalities: ["TEXT", "IMAGE"],
        imageConfig: { aspectRatio: "1:1", imageSize: "1K" }
      }
    });
  });

  it("generates many cues with bounded concurrency", async () => {
    let active = 0;
    let maxActive = 0;
    const fetchImpl: typeof fetch = async () => {
      active += 1;
      maxActive = Math.max(maxActive, active);
      await new Promise((resolve) => setTimeout(resolve, 5));
      active -= 1;
      return new Response(
        JSON.stringify({
          candidates: [
            {
              content: {
                parts: [{ inlineData: { mimeType: "image/png", data: Buffer.from("ok").toString("base64") } }]
              }
            }
          ]
        }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      );
    };

    const results = await generateExampleVisualCueBatch(
      [0, 1, 2, 3].map((index) => ({
        ...INPUT,
        exampleId: `${INPUT.exampleId}_${index}`
      })),
      { apiKey: "test-key", fetchImpl, concurrency: 2 }
    );

    expect(results.every((result) => result.ok)).toBe(true);
    expect(maxActive).toBeLessThanOrEqual(2);
  });

  it("records successful parallel results even when one request fails", async () => {
    let calls = 0;
    const fetchImpl: typeof fetch = async () => {
      calls += 1;
      if (calls === 2) return new Response("rate limited", { status: 429 });
      return new Response(
        JSON.stringify({
          candidates: [
            {
              content: {
                parts: [{ inlineData: { mimeType: "image/png", data: Buffer.from("ok").toString("base64") } }]
              }
            }
          ]
        }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      );
    };

    const results = await generateExampleVisualCueBatch(
      [0, 1, 2].map((index) => ({
        ...INPUT,
        exampleId: `${INPUT.exampleId}_${index}`
      })),
      { apiKey: "test-key", fetchImpl, concurrency: 3, continueOnError: true }
    );

    expect(results.filter((result) => result.ok)).toHaveLength(2);
    expect(results.filter((result) => !result.ok)).toHaveLength(1);
  });
});
