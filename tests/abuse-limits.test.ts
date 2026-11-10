import { expect, test } from "bun:test";
import { invalidLinkBudget, passwordWorkLimiter } from "../server/abuse-limits";

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

test("password work caps active and queued operations and transfers slots fairly", async () => {
  const run = passwordWorkLimiter(2, 4);
  const blocks = Array.from({ length: 6 }, deferred);
  const started: number[] = [];
  let active = 0,
    peak = 0;
  const jobs = blocks.map((block, index) =>
    run(async () => {
      started.push(index);
      peak = Math.max(peak, ++active);
      await block.promise;
      active--;
      return index;
    }),
  );
  expect(started).toEqual([0, 1]);
  await expect(run(async () => 7)).rejects.toMatchObject({ status: 429 });
  blocks[0].resolve();
  expect(await jobs[0]).toBe(0);
  expect(started).toEqual([0, 1, 2]);
  for (const block of blocks) block.resolve();
  expect(await Promise.all(jobs)).toEqual([0, 1, 2, 3, 4, 5]);
  expect(peak).toBe(2);
  expect(await run(async () => "recovered")).toBe("recovered");
});

test("password errors release slots for queued and subsequent work", async () => {
  const run = passwordWorkLimiter(1, 1),
    block = deferred();
  const failed = run(async () => {
    await block.promise;
    throw Error("hash failed");
  });
  const queued = run(async () => "next");
  block.resolve();
  await expect(failed).rejects.toThrow("hash failed");
  expect(await queued).toBe("next");
  expect(await run(async () => true)).toBe(true);
});

test("invalid links deduplicate clients and preserve distinct revoked-code alerts within limits", () => {
  const budget = invalidLinkBudget(() => 0);
  expect(budget.take("client").allowed).toBe(true);
  expect(budget.take("client").allowed).toBe(false);
  expect(budget.take("client", "revoked-1").allowed).toBe(true);
  expect(budget.take("client", "revoked-1").allowed).toBe(false);
  expect(budget.take("client", "revoked-2").allowed).toBe(true);
  expect(budget.take("client", "revoked-3").allowed).toBe(false);
});

test("global alert budget bounds distinct clients and summaries count against the next window", () => {
  let now = 0;
  const budget = invalidLinkBudget(() => now);
  for (let n = 0; n < 50; n++)
    expect(budget.take(`client-${n}`).allowed).toBe(n < 20);
  now = 60000;
  expect(budget.take("new-client")).toEqual({ allowed: true, summary: 30 });
  for (let n = 0; n < 30; n++)
    expect(budget.take(`new-${n}`).allowed).toBe(n < 18);
  now += 60000;
  expect(budget.take("new-client").summary).toBe(12);
  budget.reset();
  expect(budget.take("new-client")).toEqual({ allowed: true, summary: 0 });
});
