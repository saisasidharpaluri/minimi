import assert from "node:assert/strict";
import test from "node:test";
import { addInlineCitations } from "../src/shared/citations.js";

test("inline citation marker is added at the annotated claim end", () => {
  assert.equal(addInlineCitations("Pricing changed in October.", [{
    url: "https://example.com/pricing", title: "Pricing", startIndex: 0, endIndex: 27,
  }]), "Pricing changed in October. [1](https://example.com/pricing)");
});

test("citations with missing or out-of-range offsets stay in the source list only", () => {
  const answer = "A short answer.";
  assert.equal(addInlineCitations(answer, [{ url: "https://example.com", title: "Example", endIndex: 100 }]), answer);
});
