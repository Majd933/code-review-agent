export function bitbucketOrigin(input: string): string {
  const trimmed = input.trim();
  if (!trimmed) return "";
  try {
    const url = new URL(trimmed.includes("://") ? trimmed : `https://${trimmed}`);
    return `${url.protocol}//${url.host}`;
  } catch {
    return trimmed.replace(/\/+$/, "");
  }
}

/** Browser repo URL: {origin}/projects/{project}/repos/{repository} */
export function formatBitbucketRepoPageUrl(
  bitbucketUrl: string,
  project: string,
  repository: string,
): string {
  const origin = bitbucketOrigin(bitbucketUrl) || "https://bitbucket.org";
  const projectKey = project.trim() || "{project}";
  const repoSlug = repository.trim() || "{repository}";
  return `${origin}/projects/${projectKey}/repos/${repoSlug}`;
}

/** REST API repo base: {origin}/rest/api/1.0/projects/{project}/repos/{repository} */
export function formatBitbucketRestApiBaseUrl(
  bitbucketUrl: string,
  project: string,
  repository: string,
): string {
  const origin = bitbucketOrigin(bitbucketUrl) || "https://bitbucket.org";
  const projectKey = project.trim() || "{project}";
  const repoSlug = repository.trim() || "{repository}";
  return `${origin}/rest/api/1.0/projects/${projectKey}/repos/${repoSlug}`;
}

export function parseBitbucketRepoUrl(input: string): {
  bitbucketUrl: string;
  project?: string;
  repository?: string;
} {
  const trimmed = input.trim();
  try {
    const url = new URL(trimmed.includes("://") ? trimmed : `https://${trimmed}`);
    const origin = `${url.protocol}//${url.host}`;
    const parts = url.pathname.split("/").filter(Boolean);
    const projectsIdx = parts.findIndex((part) => part.toLowerCase() === "projects");
    const reposIdx = parts.findIndex((part) => part.toLowerCase() === "repos");
    if (projectsIdx >= 0 && reposIdx === projectsIdx + 2 && parts[reposIdx + 1]) {
      return {
        bitbucketUrl: origin,
        project: parts[projectsIdx + 1],
        repository: parts[reposIdx + 1].replace(/\.git$/i, ""),
      };
    }
    if (parts.length >= 2 && parts[0].toLowerCase() !== "projects") {
      return {
        bitbucketUrl: origin,
        project: parts[0],
        repository: parts[1].replace(/\.git$/i, ""),
      };
    }
    return { bitbucketUrl: origin };
  } catch {
    return { bitbucketUrl: trimmed };
  }
}
