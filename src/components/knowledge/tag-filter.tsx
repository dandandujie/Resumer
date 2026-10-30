import { useState } from "react";
import { Check, ChevronDown, Hash, Search, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { EMPTY_TAG_FILTER, type TagFilterState } from "@/lib/knowledge-tags";
export function TagFilter({
  items,
  total,
  untaggedCount,
  value,
  onChange,
}: {
  items: { name: string; count: number }[];
  total: number;
  untaggedCount: number;
  value: TagFilterState;
  onChange: (filter: TagFilterState) => void;
}) {
  const [open, setOpen] = useState(false),
    [query, setQuery] = useState("");
  const filtered = items.filter((i) =>
    i.name.toLocaleLowerCase().includes(query.toLocaleLowerCase()),
  );
  const selected = (name: string) =>
    value.tags.some((t) => t.toLocaleLowerCase() === name.toLocaleLowerCase());
  return (
    <div className="space-y-2" data-tag-filter>
      <div className="flex items-center justify-between text-[10px] text-muted-foreground">
        <span>标签 · {items.length}</span>
        {(value.tags.length > 0 || value.untagged) && (
          <button
            type="button"
            className="app-text-action"
            onClick={() => onChange({ ...EMPTY_TAG_FILTER })}
          >
            清除筛选
          </button>
        )}
      </div>
      <Popover
        open={open}
        onOpenChange={(v) => {
          setOpen(v);
          if (!v) setQuery("");
        }}
      >
        <PopoverTrigger asChild>
          <Button
            role="combobox"
            aria-label="按标签筛选资料集"
            aria-expanded={open}
            variant="outline"
            size="sm"
            className="w-full min-w-0 justify-between"
          >
            <Hash className="size-3 shrink-0" />
            <span className="min-w-0 flex-1 truncate text-left">
              {value.untagged
                ? "未打标签"
                : value.tags.length
                  ? `已选 ${value.tags.length} 个标签`
                  : "全部资料集"}
            </span>
            <span className="text-[10px] text-muted-foreground">
              共 {total} 集
            </span>
            <ChevronDown className="size-3 shrink-0" />
          </Button>
        </PopoverTrigger>
        <PopoverContent
          align="start"
          collisionPadding={12}
          className="w-[290px] max-w-[calc(100vw-24px)] p-2"
          onKeyDown={(e) => {
            if (["ArrowDown", "ArrowUp"].includes(e.key)) {
              e.preventDefault();
              const options = [
                ...e.currentTarget.querySelectorAll<HTMLButtonElement>(
                  "[role=option]",
                ),
              ];
              const index = options.indexOf(
                document.activeElement as HTMLButtonElement,
              );
              options[
                (index +
                  (e.key === "ArrowDown" ? 1 : index < 0 ? 0 : -1) +
                  options.length) %
                  options.length
              ]?.focus();
            }
          }}
        >
          <div className="relative">
            <Search className="absolute left-2 top-2.5 size-3 text-muted-foreground" />
            <Input
              autoFocus
              aria-label="查找标签"
              placeholder="查找标签…"
              className="h-8 pl-7"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </div>
          <div className="my-2 flex items-center justify-between border-b pb-2">
            <span className="text-[10px] text-muted-foreground">多选时</span>
            <div className="app-segments">
              {(["all", "any"] as const).map((mode) => (
                <button
                  key={mode}
                  type="button"
                  aria-pressed={value.match === mode}
                  onClick={() => onChange({ ...value, match: mode })}
                >
                  {mode === "all" ? "全部匹配" : "任一匹配"}
                </button>
              ))}
            </div>
          </div>
          <div
            role="listbox"
            aria-label="筛选标签"
            aria-multiselectable="true"
            className="max-h-60 overflow-y-auto"
          >
            {!query && (
              <button
                role="option"
                aria-selected={value.untagged}
                type="button"
                className="wiki-filter-option"
                onClick={() =>
                  onChange({ ...value, tags: [], untagged: !value.untagged })
                }
              >
                <span className="wiki-filter-check">
                  {value.untagged && <Check className="size-3" />}
                </span>
                <span className="flex-1">未打标签</span>
                <span className="text-muted-foreground">{untaggedCount}</span>
              </button>
            )}
            {filtered.map((item) => (
              <button
                key={item.name}
                role="option"
                aria-selected={selected(item.name)}
                type="button"
                className="wiki-filter-option"
                onClick={() =>
                  onChange({
                    ...value,
                    untagged: false,
                    tags: selected(item.name)
                      ? value.tags.filter(
                          (t) =>
                            t.toLocaleLowerCase() !==
                            item.name.toLocaleLowerCase(),
                        )
                      : [...value.tags, item.name],
                  })
                }
              >
                <span className="wiki-filter-check">
                  {selected(item.name) && <Check className="size-3" />}
                </span>
                <span className="min-w-0 flex-1 truncate" title={item.name}>
                  {item.name}
                </span>
                <span className="shrink-0 text-muted-foreground">
                  {item.count}
                </span>
              </button>
            ))}
            {!filtered.length && (
              <p className="py-5 text-center text-xs text-muted-foreground">
                没有匹配标签
              </p>
            )}
          </div>
          <div className="mt-2 flex items-center justify-between border-t pt-2 text-[10px] text-muted-foreground">
            <span>
              已选 {value.tags.length} 个 ·{" "}
              {value.match === "all" ? "需同时包含" : "包含任意一个"}
            </span>
            <Button variant="ghost" size="xs" onClick={() => setOpen(false)}>
              完成
            </Button>
          </div>
        </PopoverContent>
      </Popover>
      {(value.tags.length > 0 || value.untagged) && (
        <div className="flex max-h-20 flex-wrap gap-1 overflow-y-auto">
          {(value.untagged ? ["未打标签"] : value.tags).map((tag) => (
            <button
              key={tag}
              type="button"
              className="inline-flex max-w-full cursor-pointer items-center gap-1 rounded bg-[var(--app-accent-soft)] px-1.5 py-1 text-[10px] text-[var(--app-accent)]"
              title={tag}
              aria-label={`取消筛选 ${tag}`}
              onClick={() =>
                onChange({
                  ...value,
                  untagged: false,
                  tags: value.tags.filter((t) => t !== tag),
                })
              }
            >
              <span className="max-w-40 truncate">{tag}</span>
              <X className="size-2.5 shrink-0" />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
