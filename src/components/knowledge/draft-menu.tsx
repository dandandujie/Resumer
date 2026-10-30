import { useEffect, useState } from "react";
import { Inbox, FileText } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import * as api from "@/lib/tauri-api";
export function KnowledgeDraftMenu({
  revision,
  onSelect,
}: {
  revision: number;
  onSelect: (draft: api.KnowledgeDraft) => void;
}) {
  const [rows, setRows] = useState<api.KnowledgeDraft[]>([]),
    [open, setOpen] = useState(false),
    [error, setError] = useState("");
  useEffect(() => {
    let live = true;
    api
      .knowledgeDrafts()
      .then((rows) => {
        if (live) {
          setRows(rows);
          setError("");
        }
      })
      .catch((e) => {
        if (live) setError(String(e));
      });
    return () => {
      live = false;
    };
  }, [revision, open]);
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="outline" size="sm" aria-label="待采纳的知识建议">
          <Inbox />
          待采纳{rows.length ? ` · ${rows.length}` : ""}
        </Button>
      </PopoverTrigger>
      <PopoverContent
        align="end"
        collisionPadding={12}
        className="w-80 max-w-[calc(100vw-24px)] p-2"
      >
        <p className="px-2 py-1 text-[11px] text-muted-foreground">
          保存在本机的提炼与 Wiki 更新建议
        </p>
        <div className="max-h-72 overflow-y-auto">
          {rows.map((row) => (
            <button
              key={row.id}
              type="button"
              className="flex w-full cursor-pointer items-start gap-2 rounded-md p-2 text-left hover:bg-accent"
              onClick={() => {
                onSelect(row);
                setOpen(false);
              }}
            >
              <FileText className="mt-1 size-4 shrink-0 text-muted-foreground" />
              <span className="min-w-0">
                <span
                  className="block truncate text-xs font-medium"
                  title={row.payload.title}
                >
                  {row.payload.title || "知识更新建议"}
                </span>
                <span className="mt-1 block text-[10px] text-muted-foreground">
                  {
                    {
                      distill: "素材提炼",
                      wiki: "Wiki 更新",
                      maintenance: "维护检查",
                      answer: "问答沉淀",
                    }[row.kind]
                  }
                </span>
              </span>
            </button>
          ))}
          {!rows.length && (
            <p className="p-5 text-center text-xs text-muted-foreground">
              没有待处理建议
            </p>
          )}
          {error && (
            <p role="alert" className="p-2 text-xs text-destructive">
              {error}
            </p>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
