async function readError(res: Response): Promise<string> {
  try {
    const body = (await res.json()) as { error?: string };
    return body.error ?? `request failed: ${res.status}`;
  } catch {
    return `request failed: ${res.status}`;
  }
}

/** Ask the server to compile the project's current revision. */
export async function requestCompile(
  projectId: string,
  mainFile: string,
): Promise<{ revision: string; cached: boolean }> {
  const res = await fetch(`/api/projects/${projectId}/compile`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ mainFile }),
  });
  if (!res.ok) throw new Error(await readError(res));
  return (await res.json()) as { revision: string; cached: boolean };
}