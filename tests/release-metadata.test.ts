import { expect, test } from "bun:test";
import { releaseMetadata } from "../scripts/release-metadata";
test("only valid versions release; arbitrary tags have safe distinct Docker names", () => {
  expect(releaseMetadata("v1.2.3")).toEqual({
    is_version: true,
    prerelease: false,
    stable: true,
    image_tag: "1.2.3",
    minor: "1.2",
  });
  expect(releaseMetadata("1.2.3-rc.1")).toMatchObject({
    is_version: true,
    prerelease: true,
    stable: false,
  });
  expect(releaseMetadata("v1.2.3+build.5")).toMatchObject({
    is_version: true,
    stable: false,
    image_tag: "1.2.3_build.5",
  });
  for (const tag of [
    "vfoo",
    "v1.02.3",
    "v1.2.3-01",
    "latest",
    "preview/cleaning",
    "v1.2.3.4",
  ]) {
    const result = releaseMetadata(tag);
    expect(result.is_version).toBe(false);
    expect(result.image_tag).toMatch(/^tag-[A-Za-z0-9_.-]+$/);
    expect(result.image_tag.length).toBeLessThanOrEqual(128);
  }
  expect(releaseMetadata("preview/foo").image_tag).not.toBe(
    releaseMetadata("preview-foo").image_tag,
  );
});
