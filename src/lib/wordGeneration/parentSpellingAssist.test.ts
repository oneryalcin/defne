import { describe, expect, it } from "vitest";
import { generateParentSpellingAssistDraft } from "./parentSpellingAssist";

describe("parent spelling assist", () => {
  it("uses DeepSeek text generation for spelling drafts", async () => {
    const fetchCalls: Array<Record<string, unknown>> = [];
    const fetchImpl: typeof fetch = async (_url, init) => {
      fetchCalls.push(JSON.parse(String(init?.body)) as Record<string, unknown>);
      return new Response(
        JSON.stringify({
          choices: [
            {
              message: {
                content: JSON.stringify({
                  pairedTarget: "advise",
                  usageLabel: "noun",
                  teachingNote: "Advice is a noun for helpful suggestions someone gives.",
                  sentences: [
                    "Dad's advice helped me pack my school bag before the trip.",
                    "The nurse gave calm advice about resting the ankle."
                  ]
                })
              }
            }
          ]
        }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      );
    };

    const draft = await generateParentSpellingAssistDraft("advice", {
      textGeneration: { apiKey: "test-key", fetchImpl }
    });

    expect(draft.pairedTarget).toBe("advise");
    expect(draft.usageLabel).toBe("noun");
    expect(draft.sentences).toHaveLength(2);
    expect(fetchCalls).toHaveLength(1);
    expect(fetchCalls[0]).toMatchObject({
      model: "deepseek-v4-flash",
      response_format: { type: "json_object" },
      thinking: { type: "disabled" }
    });
  });
});
