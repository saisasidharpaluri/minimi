import assert from "node:assert/strict";
import test from "node:test";
import { dateFromTimestamp, interpretDateQuery, localDateAt, utcRangeForLocalDates } from "../server/dates.js";

test("date parsing uses the supplied timezone, including UTC date boundaries", () => {
  const now = new Date("2026-11-10T19:30:00.000Z");
  assert.equal(localDateAt(now, "Asia/Kolkata"), "2026-11-11");
  assert.deepEqual(interpretDateQuery("What did I ask on 3 November?", now, "Asia/Kolkata"), {
    from: "2026-11-03", to: "2026-11-03", label: "2026-11-03",
  });
});

test("last weekday resolves to the previous calendar weekday in local time", () => {
  const now = new Date("2026-11-11T06:00:00.000Z"); // Wednesday in Kolkata
  assert.equal(interpretDateQuery("Last Tuesday I asked about Postgres", now, "Asia/Kolkata")?.from, "2026-11-10");
  assert.equal(interpretDateQuery("yesterday", now, "Asia/Kolkata")?.from, "2026-11-10");
});

test("a weekday phrase resolves across a timezone boundary", () => {
  const now = new Date("2026-11-10T01:00:00.000Z"); // Monday evening in Los Angeles
  assert.equal(interpretDateQuery("Last Tuesday", now, "America/Los_Angeles")?.from, "2026-11-03");
  assert.equal(dateFromTimestamp("2026-11-04T03:30:00.000Z", "America/Los_Angeles"), "2026-11-03");
});

test("date parsing ignores text without an explicit date reference", () => {
  assert.equal(interpretDateQuery("Can you check the latest Postgres hosting prices?", new Date("2026-11-11T12:00:00Z"), "UTC"), null);
});

test("local dates convert to UTC ranges across zones and daylight-saving changes", () => {
  assert.deepEqual(utcRangeForLocalDates("2026-11-03", "2026-11-03", "Asia/Kolkata"), {
    from: "2026-11-02T18:30:00.000Z", to: "2026-11-03T18:30:00.000Z",
  });
  const dstDay = utcRangeForLocalDates("2026-03-08", "2026-03-08", "America/Los_Angeles");
  assert.equal(dstDay.from, "2026-03-08T08:00:00.000Z");
  assert.equal(dstDay.to, "2026-03-09T07:00:00.000Z");
});
