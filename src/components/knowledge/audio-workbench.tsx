import { useEffect, useRef, useState } from "react";
import { AudioLines, Loader2, Play, Settings, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { listen } from "@tauri-apps/api/event";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogCancel,
  AlertDialogAction,
} from "@/components/ui/alert-dialog";
import { useSpeechStore } from "@/stores/speech-store";
import { useSettingsStore } from "@/stores/settings-store";
import { useRecordingStore } from "@/stores/recording-store";
import { useUIStore } from "@/stores/ui-store";
import * as api from "@/lib/tauri-api";
export function AudioWorkbench({
  asset,
  onClose,
  onDraft,
  onChanged,
}: {
  asset: api.LibraryAsset;
  onClose: () => void;
  onDraft: (draft: api.KnowledgeDraft) => void;
  onChanged: () => void;
}) {
  const [state, setState] = useState<api.AudioKnowledgeState | null>(null),
    [pending, setPending] = useState(false),
    [error, setError] = useState(""),
    [confirm, setConfirm] = useState(false),
    [closeConfirm, setCloseConfirm] = useState(false),
    [progress, setProgress] = useState<{ done: number; total: number } | null>(
      null,
    );
  const alive = useRef(true);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);
  const key = `asset:${asset.id}`;
  const job = useRecordingStore((s) => s.jobs[key]);
  const busy = pending || !!job;
  const draft = useRecordingStore((s) => s.drafts[key]);
  const text = draft?.transcript ?? state?.transcript ?? "";
  const setText = (transcript: string) => {
    if (transcript === state?.transcript)
      useRecordingStore.getState().clear(key);
    else
      useRecordingStore
        .getState()
        .edit(key, { transcript, roundId: null, assetId: asset.id });
  };
  const config = useSpeechStore((s) => s.config);
  const configured = useSettingsStore((s) =>
    Boolean(s.aiApiKey.trim() && s.aiBaseURL.trim()),
  );
  useEffect(() => {
    let active = true;
    api
      .libraryAudioState(asset.id)
      .then((s) => {
        if (active) {
          setState(s);
        }
      })
      .catch((e) => setError(String(e)));
    return () => {
      active = false;
    };
  }, [asset.id]);
  useEffect(() => {
    const p = listen<{ id: string; done: number; total: number }>(
      "recording-progress",
      (e) => {
        if (e.payload.id === asset.id) {
          if (e.payload.done >= e.payload.total) {
            setProgress(null);
            void api.libraryAudioState(asset.id).then(setState);
          } else setProgress(e.payload);
        }
      },
    );
    return () => {
      void p.then((fn) => fn());
    };
  }, [asset.id]);
  const run = async (fn: () => Promise<void>) => {
    setPending(true);
    setError("");
    try {
      await fn();
    } catch (e) {
      const message = (e as Error)?.message || String(e);
      if (alive.current) setError(message);
      else toast.error("后台任务未完成：" + message);
    } finally {
      setPending(false);
      setProgress(null);
    }
  };
  const save = async () => {
    await useRecordingStore.getState().save(key);
    const next = await api.libraryAudioState(asset.id);
    setState(next);
    onChanged();
    return next;
  };
  const settings = (tab: string) => {
    useUIStore.getState().setSettingsTab(tab);
    useUIStore.getState().openModal("settings");
  };
  return (
    <>
      <Dialog
        open
        onOpenChange={(open) => {
          if (!open) {
            if (busy && draft) return;
            if (draft) {
              setCloseConfirm(true);
              return;
            }
            onClose();
          }
        }}
      >
        <DialogContent
          showCloseButton={!(busy && !!draft)}
          className="flex max-h-[88vh] max-w-3xl flex-col sm:max-w-3xl"
          data-library-audio
        >
          <DialogHeader>
            <DialogTitle>{asset.filename}</DialogTitle>
            <DialogDescription>
              原始录音 → 校对文字稿 → 提炼知识 → 更新
              Wiki。原文作为证据留存，提炼内容才进入常用检索。
            </DialogDescription>
          </DialogHeader>
          <div className="min-h-0 flex-1 space-y-4 overflow-y-auto">
            <div className="flex flex-wrap gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => void api.libraryOpenOriginal(asset.id)}
              >
                <Play />
                播放原件
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => settings("speech")}
              >
                <Settings />
                语音服务
              </Button>
            </div>
            <label className="block space-y-2 text-xs font-medium">
              可校对的转写原文
              <Textarea
                aria-label="资料录音转写稿"
                rows={12}
                value={text}
                onChange={(e) => setText(e.target.value)}
                disabled={busy || !state}
                className="text-xs leading-6"
                placeholder="可以转写录音，也可粘贴已有文字稿。人名、数字和专业词请先核对。"
              />
            </label>
            {state?.distillation && (
              <details className="rounded-md bg-muted p-3">
                <summary className="cursor-pointer text-xs font-medium">
                  {state.status === "ready"
                    ? "已沉淀的知识"
                    : "上次提炼（转写已变化，需要重新提炼）"}
                </summary>
                <pre className="mt-3 whitespace-pre-wrap text-xs leading-6">
                  {state.distillation}
                </pre>
              </details>
            )}
            {error && (
              <p role="alert" className="text-xs text-destructive">
                {error}
              </p>
            )}
          </div>
          <div className="flex flex-wrap items-center gap-2 border-t pt-3">
            <Button
              size="sm"
              variant="outline"
              disabled={busy || !state}
              onClick={() => setConfirm(true)}
            >
              {busy && progress ? (
                <Loader2 className="animate-spin" />
              ) : (
                <AudioLines />
              )}
              {progress
                ? `转写 ${progress.done}/${progress.total}`
                : text
                  ? "重新转写"
                  : "转成文字"}
            </Button>
            <Button
              size="sm"
              variant="outline"
              disabled={busy || !state || text === state.transcript}
              onClick={() =>
                void run(async () => {
                  await save();
                })
              }
            >
              保存校对稿
            </Button>
            <Button
              size="sm"
              variant="primary"
              disabled={busy || !text.trim()}
              onClick={() => {
                if (!configured) {
                  settings("ai");
                  return;
                }
                void run(async () => {
                  await save();
                  const result = await api.knowledgeDistillPrepare(
                    "asset",
                    asset.id,
                  );
                  if (alive.current) onDraft(result);
                  else toast.success("提炼建议已保存在知识库「待采纳」中");
                });
              }}
            >
              {busy && !progress ? (
                <Loader2 className="animate-spin" />
              ) : (
                <Sparkles />
              )}
              {configured ? "AI 提炼与沉淀" : "配置 AI 后提炼"}
            </Button>
            {busy && !draft && (
              <Button variant="ghost" size="sm" onClick={onClose}>
                后台继续，先关闭
              </Button>
            )}
            <span className="text-[10px] text-muted-foreground">
              {busy
                ? "离开页面任务继续；退出软件会中断，已完成分段可复用。"
                : "提炼覆盖全部转写分段，引用可核对。"}
            </span>
          </div>
        </DialogContent>
      </Dialog>
      <AlertDialog open={confirm} onOpenChange={setConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>开始录音转写？</AlertDialogTitle>
            <AlertDialogDescription>
              音频将发送到你配置的 {config.baseUrl}，使用 {config.model}
              ；服务可能计费。
              {text ? "将替换现有转写稿。" : "完成后请先校对，再进行知识提炼。"}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>取消</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                setConfirm(false);
                void run(async () => {
                  await save();
                  useRecordingStore
                    .getState()
                    .progress(key, { done: 0, total: 1 });
                  try {
                    const next = await api.libraryAudioTranscribe(
                      asset.id,
                      config,
                    );
                    setState(next);
                    onChanged();
                  } finally {
                    useRecordingStore.getState().progress(key, null);
                  }
                });
              }}
            >
              开始转写
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      <AlertDialog open={closeConfirm} onOpenChange={setCloseConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>保存校对稿后关闭？</AlertDialogTitle>
            <AlertDialogDescription>
              原始录音仍保留。校对稿保存后可用于AI提炼，不会直接作为知识发布。
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>继续校对</AlertDialogCancel>
            <Button
              variant="outline"
              onClick={() => {
                useRecordingStore.getState().clear(key);
                onClose();
              }}
            >
              不保存
            </Button>
            <AlertDialogAction
              onClick={(event) => {
                event.preventDefault();
                void run(async () => {
                  await save();
                  onClose();
                });
              }}
            >
              保存并关闭
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
