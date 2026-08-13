/**
 * Repository URL parsing, shared by the renderer (live feedback in the Add
 * project dialog) and the main process (deriving the name it stores). Both
 * sides have to agree on what a link means, so the rules live in one place.
 */

export type RepositoryPlatform = "github" | "gitlab";

export interface ParsedRepository {
  /** `owner/repo` — the project name derived from the link. */
  name: string;
  /** Host the repository lives on, e.g. `github.com`. */
  host: string;
  /**
   * The repository's own https URL, rebuilt from `host` and `name`. Storing
   * this rather than what was pasted means a repository is recognised as
   * already tracked whether it arrived as a PR link, an SSH remote or a
   * `.git` clone URL.
   */
  url: string;
  /** `null` when the host is neither GitHub nor GitLab. */
  platform: RepositoryPlatform | null;
}

/**
 * Path segments that begin the non-repository part of a URL, so a link to
 * `.../acme/api/pull/12` still resolves to `acme/api`.
 */
const PATH_STOP_WORDS = new Set(["pull", "pulls", "merge_requests", "tree", "blob", "issues", "-"]);

/** Scheme plus any `user@`, matching both URL and SCP-style SSH forms. */
const ORIGIN = /^(?:[a-z][a-z0-9+.-]*:\/\/)?(?:[^@/]+@)?/i;

function detectPlatform(value: string): RepositoryPlatform | null {
  if (/gitlab/i.test(value)) return "gitlab";
  if (/github/i.test(value)) return "github";
  return null;
}

/**
 * Parses an https or SSH repository link, or returns `null` when the input is
 * not one yet. A parse can succeed with `platform: null` for a host we do not
 * recognise, which the dialog reports separately from an unusable link.
 */
export function parseRepositoryLink(input: string): ParsedRepository | null {
  const clean = input
    .trim()
    .replace(/\/+$/, "")
    .replace(/\.git$/i, "")
    .replace(/\/+$/, "");
  if (!clean) return null;

  const withoutOrigin = clean.replace(ORIGIN, "");
  const host = /^([^/:]+)/.exec(withoutOrigin)?.[1] ?? "";
  const path = withoutOrigin.slice(host.length).replace(/^[/:]/, "");

  let parts = path.split("/").filter(Boolean);
  // Drop `/pull/12`, `/-/merge_requests/5`, `/tree/main`, ... after owner/repo.
  const stop = parts.findIndex((part) => PATH_STOP_WORDS.has(part));
  if (stop > 1) parts = parts.slice(0, stop);
  if (parts.length < 2) return null;

  // The host decides the platform and the rest of the link only breaks a tie,
  // so a repository named `gitlab-runner` on github.com still reads as GitHub.
  const platform = detectPlatform(host) ?? detectPlatform(clean);

  // GitLab nests projects under groups, so every segment before the `/-/`
  // marker belongs to the path. A GitHub project is always `owner/repo`, and
  // anything after that is a page within the repository.
  const name = (platform === "gitlab" ? parts : parts.slice(0, 2)).join("/");
  const resolvedHost = host || (platform === "gitlab" ? "gitlab.com" : "github.com");

  return {
    name,
    host: resolvedHost,
    url: `https://${resolvedHost}/${name}`,
    platform,
  };
}
