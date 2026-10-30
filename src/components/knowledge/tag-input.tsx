import { useRef, useState } from "react";
import { Hash, X, Plus } from "lucide-react";
import { normalizeTags } from "@/lib/knowledge-tags";
export function TagInput({
  value,
  onChange,
  suggestions = [],
  disabled = false,
  label = "资料集标签",
}: {
  value: string[];
  onChange: (tags: string[]) => void;
  suggestions?: string[];
  disabled?: boolean;
  label?: string;
}) {
  const [input, setInput] = useState(""),
    [focused, setFocused] = useState(false),
    [active, setActive] = useState(-1);
  const ref = useRef<HTMLInputElement>(null);
  const add = (text: string) => {
    const tags = normalizeTags([...value, ...text.split(/[,，;；\n]+/)]);
    if (tags.some((v) => v.length > 80) || tags.length > 50) return;
    onChange(tags);
    setInput("");
    setFocused(false);
    setActive(-1);
  };
  const options = suggestions
    .filter(
      (t) =>
        !value.some((v) => v.toLocaleLowerCase() === t.toLocaleLowerCase()) &&
        t.toLocaleLowerCase().includes(input.toLocaleLowerCase()),
    )
    .slice(0, 8);
  return (
    <div className="relative space-y-1.5" data-tag-input>
      <div
        className="flex max-h-32 min-h-10 flex-wrap items-center gap-1.5 overflow-y-auto rounded-md border bg-[var(--app-field)] p-2 focus-within:outline-2 focus-within:outline-offset-1 focus-within:outline-[var(--app-accent)]"
        onClick={() => ref.current?.focus()}
      >
        {value.map((tag) => (
          <span
            key={tag.toLocaleLowerCase()}
            className="inline-flex max-w-full items-center gap-1 rounded bg-[var(--app-accent-soft)] px-1.5 py-0.5 text-[11px] text-[var(--app-accent)]"
          >
            <Hash className="size-2.5 shrink-0" />
            <span className="truncate" title={tag}>
              {tag}
            </span>
            <button
              type="button"
              disabled={disabled}
              aria-label={`移除标签 ${tag}`}
              onClick={(e) => {
                e.stopPropagation();
                onChange(value.filter((v) => v !== tag));
              }}
              className="shrink-0 cursor-pointer rounded hover:bg-[var(--app-hover)] disabled:opacity-40"
            >
              <X className="size-3" />
            </button>
          </span>
        ))}
        <input
          ref={ref}
          aria-label={label}
          autoComplete="off"
          maxLength={80}
          disabled={disabled || value.length >= 50}
          value={input}
          onFocus={() => setFocused(true)}
          onBlur={() => {
            if (input.trim()) add(input);
            setFocused(false);
          }}
          onChange={(e) => {
            setInput(e.target.value);
            setActive(-1);
          }}
          onKeyDown={(e) => {
            if (e.nativeEvent.isComposing) return;
            if (e.key === "ArrowDown" && options.length) {
              e.preventDefault();
              setActive((active + 1) % options.length);
            } else if (e.key === "ArrowUp" && options.length) {
              e.preventDefault();
              setActive(
                active < 0
                  ? options.length - 1
                  : (active - 1 + options.length) % options.length,
              );
            } else if (["Enter", ",", "，", ";", "；"].includes(e.key)) {
              e.preventDefault();
              add(active >= 0 ? options[active] : input);
            } else if (e.key === "Escape") {
              e.stopPropagation();
              setFocused(false);
            } else if (e.key === "Backspace" && !input && value.length)
              onChange(value.slice(0, -1));
          }}
          placeholder={value.length ? "添加标签…" : "输入标签，按 Enter 添加"}
          className="h-6 min-w-28 flex-1 border-0 bg-transparent text-xs outline-none disabled:opacity-50"
        />
      </div>
      {focused && options.length > 0 && (
        <div
          role="listbox"
          aria-label="已有标签建议"
          className="absolute left-0 right-0 top-full z-50 mt-1 flex max-h-24 flex-wrap gap-1 overflow-y-auto rounded-md border bg-popover p-1.5 shadow-md"
        >
          {options.map((tag, i) => (
            <button
              type="button"
              role="option"
              aria-selected={active === i}
              key={tag}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => {
                add(tag);
                ref.current?.focus();
              }}
              className={`inline-flex max-w-full cursor-pointer items-center gap-1 rounded px-2 py-1 text-[11px] ${active === i ? "bg-[var(--app-accent-soft)] text-[var(--app-accent)]" : "hover:bg-accent text-muted-foreground"}`}
            >
              <Plus className="size-2.5 shrink-0" />
              <span className="truncate">{tag}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
