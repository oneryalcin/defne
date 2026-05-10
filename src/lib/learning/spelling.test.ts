import { describe, expect, it } from "vitest";
import { allCorrectSelection, assessSpellingAnswer, buildSpellingQuestion, tokenSelection } from "./spelling";

describe("spelling practice", () => {
  const item = {
    id: "spelling_prey",
    target: "prey",
    teachingNote: "Prey is a noun. It means an animal hunted by another animal.",
    studyGroup: "pray_prey",
    usageLabel: "noun",
    prompts: [
      {
        id: "prompt_1",
        sentence: "The owl watched its prey from the branch."
      },
      {
        id: "prompt_2",
        sentence: "Tiny fish can become prey for herons."
      }
    ]
  };
  const peer = {
    id: "spelling_pray",
    target: "pray",
    teachingNote: "Pray is a verb.",
    studyGroup: "pray_prey",
    usageLabel: "verb",
    prompts: [
      {
        id: "prompt_pray_1",
        sentence: "Some families pray quietly before dinner."
      }
    ]
  };

  it("builds a clean sentence when no mistake is scheduled", () => {
    const question = buildSpellingQuestion(item, 0, [item, peer]);

    expect(question.displayedSentence).toBe("The owl watched its prey from the branch.");
    expect(question.issueKind).toBe("none");
    expect(question.expectedSelection).toBe(allCorrectSelection());
    expect(question.tokens.some((token) => token.text === "prey" && token.isWord)).toBe(true);
  });

  it("can swap a paired word into the sentence as the single mistake", () => {
    const question = buildSpellingQuestion(item, 1, [item, peer]);

    expect(question.displayedSentence).toBe("Tiny fish can become pray for herons.");
    expect(question.issueKind).toBe("confusable");
    expect(question.correctWord).toBe("prey");
    expect(question.correctTokenIndex).not.toBeNull();
    expect(question.expectedSelection).toBe(tokenSelection(question.correctTokenIndex ?? -1));
  });

  it("can show a misspelled word as the single mistake", () => {
    const affect = {
      id: "spelling_affect",
      target: "affect",
      teachingNote: "Affect is usually a verb.",
      studyGroup: "affect_effect",
      usageLabel: "verb",
      prompts: [
        {
          id: "prompt_affect_1",
          sentence: "A sudden storm can affect the timing of an outdoor match."
        }
      ]
    };
    const question = buildSpellingQuestion(affect, 2, [affect]);

    expect(question.displayedSentence).toBe("A sudden storm can afect the timing of an outdoor match.");
    expect(question.issueKind).toBe("misspelling");
  });

  it("uses reviewed seed misspellings when provided", () => {
    const calendar = {
      id: "spelling_calendar",
      target: "calendar",
      teachingNote: "Calendar is a commonly misspelled word.",
      studyGroup: "calendar",
      usageLabel: "noun",
      commonMisspelling: "calender",
      prompts: [
        {
          id: "prompt_calendar_1",
          sentence: "Mina marked the trip date on the classroom calendar."
        }
      ]
    };
    const question = buildSpellingQuestion(calendar, 2, [calendar]);

    expect(question.displayedSentence).toBe("Mina marked the trip date on the classroom calender.");
    expect(question.issueKind).toBe("misspelling");
  });

  it("assesses sentence selections", () => {
    const cleanQuestion = buildSpellingQuestion(item, 0, [item, peer]);
    const mistakeQuestion = buildSpellingQuestion(item, 1, [item, peer]);

    expect(assessSpellingAnswer(cleanQuestion, allCorrectSelection())).toMatchObject({ isCorrect: true });
    expect(assessSpellingAnswer(cleanQuestion, tokenSelection(0))).toMatchObject({ isCorrect: false });
    expect(assessSpellingAnswer(mistakeQuestion, tokenSelection(mistakeQuestion.correctTokenIndex ?? -1))).toMatchObject({
      isCorrect: true
    });
    expect(assessSpellingAnswer(mistakeQuestion, allCorrectSelection())).toMatchObject({ isCorrect: false });
  });
});
