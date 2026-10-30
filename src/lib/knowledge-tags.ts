export type TagFilterState = {
  tags: string[];
  match: "all" | "any";
  untagged: boolean;
};
export const EMPTY_TAG_FILTER: TagFilterState = {
  tags: [],
  match: "all",
  untagged: false,
};
export function collectionTags(collection: {
  tags?: string[];
  category?: string;
}): string[] {
  return collection.tags ?? (collection.category ? [collection.category] : []);
}
export function normalizeTags(values: string[]): string[] {
  const seen = new Set<string>();
  return values
    .map((v) => v.trim().replace(/^#+/, "").trim())
    .filter((v) => {
      const key = v.toLocaleLowerCase();
      if (!v || seen.has(key)) return false;
      seen.add(key);
      return true;
    });
}
export function matchesTags(tags: string[], filter: TagFilterState) {
  if (filter.untagged) return tags.length === 0;
  if (!filter.tags.length) return true;
  const keys = new Set(tags.map((t) => t.toLocaleLowerCase()));
  return filter.match === "all"
    ? filter.tags.every((t) => keys.has(t.toLocaleLowerCase()))
    : filter.tags.some((t) => keys.has(t.toLocaleLowerCase()));
}
export function countTags(items: { tags?: string[]; category?: string }[]) {
  const counts = new Map<string, { name: string; count: number }>();
  for (const item of items)
    for (const tag of normalizeTags(collectionTags(item))) {
      const key = tag.toLocaleLowerCase();
      const row = counts.get(key);
      if (row) row.count++;
      else counts.set(key, { name: tag, count: 1 });
    }
  return [...counts.values()].sort((a, b) =>
    a.name.localeCompare(b.name, "zh-CN"),
  );
}
