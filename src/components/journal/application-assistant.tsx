import { useJournalStore, type Application } from "@/stores/journal-store";
import { WorkspaceAssistant } from "@/components/ai/workspace-assistant";
import { applyJournalActions } from "@/lib/workspace-actions";
import { toast } from "sonner";

type Base = { applications: Application[]; view?: string };
export function ApplicationAssistant({
  application,
  view = "overview",
  onCreated,
}: {
  application?: Application;
  view?: string;
  onCreated?: (id: string) => void;
}) {
  const examples =
    view === "interviews"
      ? [
          "记下二面：下周五14点视频面试，重点准备项目架构",
          "把刚才的面试问答整理到对应轮次",
        ]
      : view === "outcome"
        ? ["今天收到 Offer，帮我记录结果和复盘重点"]
        : [
            "我今天通过 Boss 投了星河科技的前端工程师",
            "根据本周面试记录，帮我安排接下来的准备重点",
          ];
  return (
    <WorkspaceAssistant
      scope={application ? "application" : "activity"}
      title="自然语言管理求职记录"
      placeholder={
        application
          ? "例如：二面改到下周五下午两点，帮我整理面试记录和准备重点…"
          : "记一次投递、更新进展、安排面试，或询问接下来该怎么准备…"
      }
      examples={examples}
      context={() => ({
        applications: application
          ? [
              useJournalStore
                .getState()
                .applications.find((a) => a.id === application.id) ||
                application,
            ]
          : useJournalStore.getState().applications,
        view,
      })}
      requestContext={(base) => {
        const b = base as Base;
        return {
          ...b,
          applications: b.applications
            .slice(0, 150)
            .map((a) => ({
              ...a,
              jd: a.jd.slice(0, application ? 20_000 : 500),
              notes: a.notes.slice(0, 1000),
              interviews: a.interviews.map((r) => ({
                ...r,
                notes: r.notes?.slice(0, 1000),
              })),
            })),
        };
      }}
      targetLabel={(action, base) => {
        const a = (base as Base).applications.find(
          (a) => a.id === action.targetId,
        );
        return a
          ? [
              a.company,
              a.role,
              action.kind === "interview"
                ? action.roundId
                  ? "更新面试轮次"
                  : "新增面试轮次"
                : action.kind === "outcome"
                  ? "结果"
                  : "",
            ]
              .filter(Boolean)
              .join(" · ")
          : "新建投递记录";
      }}
      onApply={async (actions, base) => {
        const ids = await applyJournalActions(
          actions,
          (base as Base).applications,
        );
        toast.success("已更新求职记录");
        if (!(base as Base).applications.length && ids[0]) onCreated?.(ids[0]);
      }}
    />
  );
}
