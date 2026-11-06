/** Backend limits count Unicode scalar values. Array.from never splits a surrogate pair. */
export function defaultResumeWorkspaceTitle(baseTitle: string, goal: string): string {
  const purpose = Array.from(goal.trim().replace(/\s+/gu, ' ')).slice(0, 24).join('');
  const suffix = purpose ? ` · ${purpose}` : '';
  const baseBudget = 200 - Array.from(suffix).length;
  const base = Array.from(baseTitle.trim() || '简历').slice(0, baseBudget).join('');
  return `${base}${suffix}`;
}
