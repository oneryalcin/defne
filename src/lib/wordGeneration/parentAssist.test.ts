import { describe, expect, it } from "vitest";
import { generateParentWordAssistDraft } from "./parentAssist";

describe("parent vocabulary assist", () => {
  it("uses DeepSeek text generation and leaves image previews off by default", async () => {
    const fetchCalls: Array<{ url: string; body: Record<string, unknown>; headers: Headers }> = [];
    const fetchImpl: typeof fetch = async (url, init) => {
      fetchCalls.push({
        url: String(url),
        body: JSON.parse(String(init?.body)) as Record<string, unknown>,
        headers: new Headers(init?.headers)
      });
      return new Response(
        JSON.stringify({
          choices: [
            {
              message: {
                content: JSON.stringify({
                  definition: "not willing or not keen to do something",
                  synonyms: ["hesitant", "wary"],
                  antonyms: ["eager", "willing"],
                  examples: [
                    "Mina was reluctant to step onto the stage, so she waited behind the curtain until her friend squeezed her hand.",
                    "The puppy was reluctant to leave the warm basket when rain tapped against the kitchen window.",
                    "Ari felt reluctant to erase the drawing because he had spent all morning shading the tiny roofs."
                  ]
                })
              }
            }
          ]
        }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      );
    };

    const draft = await generateParentWordAssistDraft("reluctant", {
      textGeneration: { apiKey: "test-key", fetchImpl }
    });

    expect(draft.definition).toBe("not willing or not keen to do something");
    expect(draft.examples).toHaveLength(3);
    expect(draft.examples.every((example) => example.visualCue === null)).toBe(true);
    expect(draft.warnings).toEqual([]);
    expect(fetchCalls).toHaveLength(1);
    expect(fetchCalls[0].url).toBe("https://api.deepseek.com/chat/completions");
    expect(fetchCalls[0].headers.get("authorization")).toBe("Bearer test-key");
    expect(fetchCalls[0].body).toMatchObject({
      model: "deepseek-v4-flash",
      response_format: { type: "json_object" },
      thinking: { type: "disabled" },
      stream: false
    });
    const messages = fetchCalls[0].body.messages as Array<{ content: string }>;
    expect(messages[1].content).toContain("Do not include any of these exact words in the definition:");
    expect(messages[1].content).toContain('"reluctant"');
  });

  it("cleans a leading dictionary-style target prefix before validating the definition", async () => {
    const fetchImpl: typeof fetch = async () =>
      new Response(
        JSON.stringify({
          choices: [
            {
              message: {
                content: JSON.stringify({
                  definition: "A fez is a tall, red, flat-topped hat with a tassel, originally from Morocco.",
                  synonyms: ["hat", "cap"],
                  antonyms: ["bareheaded", "uncovered"],
                  examples: [
                    "The dancer wore a red fez with a black tassel that swung as he bowed to the crowd.",
                    "Grandad placed his fez carefully on the shelf so the tassel would not get crushed.",
                    "At the museum, Mina spotted a bright fez beside robes from North Africa."
                  ]
                })
              }
            }
          ]
        }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      );

    const draft = await generateParentWordAssistDraft("fez", {
      textGeneration: { apiKey: "test-key", fetchImpl }
    });

    expect(draft.definition).toBe("a tall, red, flat-topped hat with a tassel, originally from Morocco.");
  });

  it("retries text generation when the first JSON draft fails validation", async () => {
    const prompts: string[] = [];
    const fetchImpl: typeof fetch = async (_url, init) => {
      const body = JSON.parse(String(init?.body)) as { messages: Array<{ content: string }> };
      prompts.push(body.messages[1].content);
      const content =
        prompts.length === 1
          ? {
              definition: "Loot is stolen treasure taken by looting.",
              synonyms: ["plunder", "spoils"],
              antonyms: ["gift", "earning"],
              examples: [
                "The pirates carried the loot away in heavy chests after robbing the ship.",
                "Police found the loot hidden under a loose floorboard after the burglary.",
                "The thieves dropped the loot when the alarm rang through the museum."
              ]
            }
          : {
              definition: "stolen treasure taken after a robbery or raid",
              synonyms: ["plunder", "spoils"],
              antonyms: ["gift", "earning"],
              examples: [
                "The pirates carried the loot away in heavy chests after robbing the ship.",
                "Police found the loot hidden under a loose floorboard after the burglary.",
                "The thieves dropped the loot when the alarm rang through the museum."
              ]
            };
      return new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify(content) } }] }), {
        status: 200,
        headers: { "Content-Type": "application/json" }
      });
    };

    const draft = await generateParentWordAssistDraft("loot", {
      textGeneration: { apiKey: "test-key", fetchImpl }
    });

    expect(draft.definition).toBe("stolen treasure taken after a robbery or raid");
    expect(prompts).toHaveLength(2);
    expect(prompts[1]).toContain("Your previous JSON was rejected by the app validator");
    expect(prompts[1]).toContain("looting");
  });

  it("rejects examples that do not use the exact target word form", async () => {
    const fetchImpl: typeof fetch = async () =>
      new Response(
        JSON.stringify({
          choices: [
            {
              message: {
                content: JSON.stringify({
                  definition: "to make it harder for someone to do something",
                  synonyms: ["block", "delay"],
                  antonyms: ["help", "assist"],
                  examples: [
                    "The mud began to hinder the runners as they crossed the field.",
                    "The heavy bag would hinder Mina on the long walk home.",
                    "The loud music hindered Tom's concentration during homework."
                  ]
                })
              }
            }
          ]
        }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      );

    await expect(
      generateParentWordAssistDraft("hinder", {
        textGeneration: { apiKey: "test-key", fetchImpl }
      })
    ).rejects.toThrow("non-exact target word form");
  });

  it("rejects circular definitions that reuse the target word or close forms", async () => {
    const fetchImpl: typeof fetch = async () =>
      new Response(
        JSON.stringify({
          choices: [
            {
              message: {
                content: JSON.stringify({
                  definition: "Loot is stolen treasure taken by looting.",
                  synonyms: ["plunder", "spoils"],
                  antonyms: ["gift", "earning"],
                  examples: [
                    "The pirates carried the loot away in heavy chests after robbing the ship.",
                    "Police found the loot hidden under a loose floorboard after the burglary.",
                    "The thieves dropped the loot when the alarm rang through the museum."
                  ]
                })
              }
            }
          ]
        }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      );

    await expect(
      generateParentWordAssistDraft("loot", {
        textGeneration: { apiKey: "test-key", fetchImpl }
      })
    ).rejects.toThrow("target word or a close form in its definition");
  });
});
