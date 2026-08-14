import { describe, expect, it } from "vitest";
import { parseRepositoryLink } from "./repoUrl";

describe("parseRepositoryLink", () => {
  describe("the forms a repository link arrives in", () => {
    // Every one of these is the same repository. The point of rebuilding `url`
    // rather than keeping what was pasted is that they all collapse onto one,
    // so a project cannot be added twice under two spellings of its remote.
    const sameRepo = [
      "https://github.com/acme/api",
      "https://github.com/acme/api/",
      "https://github.com/acme/api.git",
      "http://github.com/acme/api",
      "git@github.com:acme/api.git",
      "ssh://git@github.com/acme/api.git",
      "github.com/acme/api",
      "  https://github.com/acme/api  ",
    ];

    it.each(sameRepo)("reads %s as acme/api on github.com", (link) => {
      expect(parseRepositoryLink(link)).toEqual({
        name: "acme/api",
        host: "github.com",
        url: "https://github.com/acme/api",
        platform: "github",
      });
    });
  });

  describe("links to a page inside a repository", () => {
    it.each([
      ["https://github.com/acme/api/pull/12", "acme/api"],
      ["https://github.com/acme/api/pulls", "acme/api"],
      ["https://github.com/acme/api/issues/4", "acme/api"],
      ["https://github.com/acme/api/tree/main/src", "acme/api"],
      ["https://github.com/acme/api/blob/main/README.md", "acme/api"],
    ])("trims %s down to the repository", (link, name) => {
      expect(parseRepositoryLink(link)?.name).toBe(name);
    });

    it("keeps a repository whose owner is a stop word", () => {
      // `stop > 1` exists so a repository named after a stop word survives.
      expect(parseRepositoryLink("https://github.com/pull/tree")?.name).toBe("pull/tree");
    });
  });

  describe("gitlab groups", () => {
    it("keeps every group segment before the /-/ marker", () => {
      expect(parseRepositoryLink("https://gitlab.com/acme/team/api")).toEqual({
        name: "acme/team/api",
        host: "gitlab.com",
        url: "https://gitlab.com/acme/team/api",
        platform: "gitlab",
      });
    });

    it("stops a nested group at its merge request page", () => {
      expect(parseRepositoryLink("https://gitlab.com/acme/team/api/-/merge_requests/5")?.name).toBe(
        "acme/team/api",
      );
    });

    it("reads an SSH remote with a nested group", () => {
      expect(parseRepositoryLink("git@gitlab.com:acme/team/api.git")?.name).toBe("acme/team/api");
    });
  });

  describe("deciding the platform", () => {
    it("lets the host decide, not the repository name", () => {
      // The comment in repoUrl.ts calls this out: `gitlab-runner` on github.com
      // is a GitHub project, and only two segments of it are the name.
      const parsed = parseRepositoryLink("https://github.com/acme/gitlab-runner");
      expect(parsed?.platform).toBe("github");
      expect(parsed?.name).toBe("acme/gitlab-runner");
    });

    it("recognises a self-hosted host by its name", () => {
      expect(parseRepositoryLink("https://gitlab.acme.dev/team/api")).toEqual({
        name: "team/api",
        host: "gitlab.acme.dev",
        url: "https://gitlab.acme.dev/team/api",
        platform: "gitlab",
      });
    });

    it("parses an unrecognised host with a null platform", () => {
      // A parse can succeed with no platform; the dialog reports that case
      // differently from a link it could not read at all.
      expect(parseRepositoryLink("https://git.acme.dev/team/api")).toEqual({
        name: "team/api",
        host: "git.acme.dev",
        url: "https://git.acme.dev/team/api",
        platform: null,
      });
    });
  });

  describe("input that is not a repository link yet", () => {
    it.each([
      ["an empty string", ""],
      ["only whitespace", "   "],
      ["only slashes", "///"],
      ["a bare host", "github.com"],
      ["a host and one segment", "https://github.com/acme"],
      ["a single word", "acme"],
      ["a trailing .git alone", ".git"],
    ])("returns null for %s", (_label, input) => {
      expect(parseRepositoryLink(input)).toBeNull();
    });
  });
});
