import { describe, expect, it } from "vitest";
import {
  spellingProgressBuckets,
  spellingProgressStatus,
} from "./ProgressDistribution";

describe("spelling progress status", () => {
  it.each([
    [{ attemptCount: 0, correctCount: 0, wrongCount: 0 }, "not_started"],
    [{ attemptCount: 3, correctCount: 1, wrongCount: 2 }, "needs_work"],
    [{ attemptCount: 3, correctCount: 2, wrongCount: 1 }, "practising"],
    [{ attemptCount: 1, correctCount: 1, wrongCount: 0 }, "spotted_once"],
    [{ attemptCount: 2, correctCount: 2, wrongCount: 0 }, "reliable"],
    [{ attemptCount: 3, correctCount: 3, wrongCount: 0 }, "steady"],
  ] as const)("classifies %o as %s", (counts, expected) => {
    expect(spellingProgressStatus(counts)).toBe(expected);
  });

  it("counts every spelling in exactly one labelled bucket", () => {
    const buckets = spellingProgressBuckets([
      { attemptCount: 0, correctCount: 0, wrongCount: 0 },
      { attemptCount: 2, correctCount: 0, wrongCount: 2 },
      { attemptCount: 3, correctCount: 2, wrongCount: 1 },
      { attemptCount: 2, correctCount: 2, wrongCount: 0 },
    ]);

    expect(buckets.map(({ key, count }) => [key, count])).toEqual([
      ["not_started", 1],
      ["needs_work", 1],
      ["practising", 1],
      ["spotted_once", 0],
      ["reliable", 1],
      ["steady", 0],
    ]);
  });
});
