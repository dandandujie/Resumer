'use client';

import { useState, useEffect, useCallback } from 'react';
import { useTranslations } from 'next-intl';
import {
  Loader2,
  RotateCcw,
  Target,
  ShieldCheck,
  Lightbulb,
  AlertTriangle,
  Wand2,
  Trash2,
  FileSearch,
  ArrowUp,
  ArrowDown,
  Minus,
  ChevronLeft,
  Briefcase,
  ChevronDown,
  CopyPlus,
  BookOpenCheck,
} from 'lucide-react';
import { toast } from 'sonner';
import { logError } from '@/stores/error-log-store';
import { useRouter } from '@/i18n/routing';
import { useResumeStore } from '@/stores/resume-store';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { useEditorStore } from '@/stores/editor-store';
import { useUIStore } from '@/stores/ui-store';
import { ApplicationContextPicker } from '@/components/journal/application-context-picker';
import { useJournalStore } from '@/stores/journal-store';
import { analyzeJD } from '@/lib/ai/client-ai-service';
import * as api from '@/lib/tauri-api';

interface JdAnalysisResult {
  overallScore: number;
  keywordMatches: string[];
  missingKeywords: string[];
  suggestions: { section: string; current: string; suggested: string }[];
  atsScore: number;
  summary: string;
}

interface HistoryItem {
  id: string;
  overallScore: number;
  atsScore: number;
  jobDescription: string;
  createdAt: string | number;
}

interface JdAnalysisDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  resumeId: string;
}

function getScoreColor(score: number): string {
  if (score < 40) return 'text-red-500';
  if (score <= 70) return 'text-yellow-500';
  return 'text-[var(--app-text-secondary)]';
}

function getScoreStroke(score: number): string {
  if (score < 40) return 'stroke-red-500';
  if (score <= 70) return 'stroke-yellow-500';
  return 'stroke-[var(--app-text-secondary)]';
}

function getScoreTrack(score: number): string {
  if (score < 40) return 'stroke-red-100';
  if (score <= 70) return 'stroke-yellow-100';
  return 'stroke-[var(--app-border)]';
}

function ScoreCircle({
  score,
  label,
  size = 'lg',
}: {
  score: number;
  label: string;
  size?: 'sm' | 'lg';
}) {
  const isSm = size === 'sm';
  const radius = isSm ? 16 : 40;
  const viewBox = isSm ? '0 0 40 40' : '0 0 100 100';
  const cx = isSm ? 20 : 50;
  const strokeWidth = isSm ? 3 : 8;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (score / 100) * circumference;

  return (
    <div className="flex flex-col items-center gap-1">
      <div className={`relative ${isSm ? 'h-10 w-10' : 'h-24 w-24'}`}>
        <svg
          className={`${isSm ? 'h-10 w-10' : 'h-24 w-24'} -rotate-90`}
          viewBox={viewBox}
        >
          <circle
            cx={cx}
            cy={cx}
            r={radius}
            fill="none"
            strokeWidth={strokeWidth}
            className={getScoreTrack(score)}
          />
          <circle
            cx={cx}
            cy={cx}
            r={radius}
            fill="none"
            strokeWidth={strokeWidth}
            strokeLinecap="round"
            strokeDasharray={circumference}
            strokeDashoffset={offset}
            className={`${getScoreStroke(score)} transition-all duration-700 ease-out`}
          />
        </svg>
        <div className="absolute inset-0 flex items-center justify-center">
          <span
            className={`font-bold ${getScoreColor(score)} ${isSm ? 'text-xs' : 'text-2xl'}`}
          >
            {score}
          </span>
        </div>
      </div>
      {!isSm && (
        <span className="text-xs font-medium text-muted-foreground">
          {label}
        </span>
      )}
    </div>
  );
}

function ScoreTrend({
  current,
  previous,
}: {
  current: number;
  previous?: number;
}) {
  if (previous === undefined) return null;
  const diff = current - previous;
  if (diff > 0) return <ArrowUp className="h-3.5 w-3.5 text-[var(--app-text-secondary)]" />;
  if (diff < 0) return <ArrowDown className="h-3.5 w-3.5 text-red-500" />;
  return <Minus className="h-3.5 w-3.5 text-muted-foreground" />;
}

function formatDate(value: string | number): string {
  const d =
    typeof value === 'number' ? new Date(value * 1000) : new Date(value);
  return d.toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

/* ── Result view (shared between new analysis & history detail) ── */
function JdAnalysisResultView({
  result,
  jobDescription,
  t,
}: {
  result: JdAnalysisResult;
  jobDescription?: string;
  t: any;
}) {
  const [jdExpanded, setJdExpanded] = useState(false);

  return (
    <div className="px-6 py-4 space-y-6">
      {/* Job Description */}
      {jobDescription && (
        <div className="rounded-lg border border-border bg-muted/50">
          <button
            type="button"
            onClick={() => setJdExpanded(!jdExpanded)}
            className="flex w-full items-center gap-1.5 px-3.5 py-2.5 text-left cursor-pointer"
          >
            <Briefcase className="h-4 w-4 text-muted-foreground shrink-0" />
            <span className="text-sm font-semibold text-foreground flex-1 truncate">
              {t('jobDescriptionLabel')}
            </span>
            <ChevronDown
              className={`h-4 w-4 text-muted-foreground transition-transform ${jdExpanded ? 'rotate-180' : ''}`}
            />
          </button>
          {jdExpanded && (
            <div className="border-t border-border px-3.5 py-3">
              <p className="text-sm leading-relaxed text-[var(--app-text-secondary)] whitespace-pre-wrap">
                {jobDescription}
              </p>
            </div>
          )}
        </div>
      )}

      {/* Score Dashboard */}
      <div className="flex items-center justify-center gap-10 rounded-xl border border-border bg-muted/50 py-5">
        <ScoreCircle score={result.overallScore} label={t('overallScore')} />
        <ScoreCircle score={result.atsScore} label={t('atsScore')} />
      </div>

      {/* Summary */}
      <div className="space-y-2">
        <h4 className="flex items-center gap-1.5 text-sm font-semibold text-foreground">
          <Target className="h-4 w-4 text-muted-foreground" />
          {t('summary')}
        </h4>
        <p className="text-sm leading-relaxed text-[var(--app-text-secondary)]">
          {result.summary}
        </p>
      </div>

      {/* Keyword Matches */}
      {result.keywordMatches.length > 0 && (
        <div className="space-y-2">
          <h4 className="flex items-center gap-1.5 text-sm font-semibold text-foreground">
            <ShieldCheck className="h-4 w-4 text-[var(--app-text-secondary)]" />
            {t('keywordMatches')}
          </h4>
          <div className="flex flex-wrap gap-1.5">
            {result.keywordMatches.map((keyword) => (
              <Badge
                key={keyword}
                className="bg-[var(--app-hover)] text-[var(--app-text-secondary)] border-[var(--app-border)]"
              >
                {keyword}
              </Badge>
            ))}
          </div>
        </div>
      )}

      {/* Missing Keywords */}
      {result.missingKeywords.length > 0 && (
        <div className="space-y-2">
          <h4 className="flex items-center gap-1.5 text-sm font-semibold text-foreground">
            <AlertTriangle className="h-4 w-4 text-orange-500" />
            {t('missingKeywords')}
          </h4>
          <div className="flex flex-wrap gap-1.5">
            {result.missingKeywords.map((keyword) => (
              <Badge
                key={keyword}
                className="bg-orange-50 text-orange-700 border-orange-200"
              >
                {keyword}
              </Badge>
            ))}
          </div>
        </div>
      )}

      {/* Suggestions */}
      {result.suggestions.length > 0 && (
        <div className="space-y-3">
          <h4 className="flex items-center gap-1.5 text-sm font-semibold text-foreground">
            <Lightbulb className="h-4 w-4 text-yellow-500" />
            {t('suggestions')}
          </h4>
          <div className="space-y-2.5">
            {result.suggestions.map((suggestion, idx) => (
              <div
                key={idx}
                className="rounded-lg border border-border bg-card p-3.5 space-y-2"
              >
                <Badge variant="secondary" className="text-xs font-medium">
                  {suggestion.section}
                </Badge>
                <div className="space-y-1.5">
                  <div>
                    <span className="text-xs font-medium text-muted-foreground">
                      {t('currentState')}
                    </span>
                    <p className="text-sm text-[var(--app-text-secondary)]">
                      {suggestion.current}
                    </p>
                  </div>
                  <div>
                    <span className="text-xs font-medium text-brand">
                      {t('suggestedChange')}
                    </span>
                    <p className="text-sm text-foreground">
                      {suggestion.suggested}
                    </p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* No results fallback */}
      {!result.summary &&
        result.keywordMatches.length === 0 &&
        result.missingKeywords.length === 0 &&
        result.suggestions.length === 0 && (
          <p className="py-8 text-center text-sm text-muted-foreground">
            {t('noResults')}
          </p>
        )}
    </div>
  );
}

export function JdAnalysisDialog({
  open,
  onOpenChange,
  resumeId,
}: JdAnalysisDialogProps) {
  const t = useTranslations('jdAnalysis');
  const ct = useTranslations('common');
  const router = useRouter();
  const { setPendingAiMessage, setRightPaneTab } = useEditorStore();
  const toolPrefill = useEditorStore((s) => s.toolPrefill);
  const setToolPrefill = useEditorStore((s) => s.setToolPrefill);
  const openModal = useUIStore((s) => s.openModal);
  const createApplication = useJournalStore((s) => s.createApplication);
  const updateApplication = useJournalStore((s) => s.updateApplication);
  const applications = useJournalStore((s) => s.applications);
  const hydrateJournal = useJournalStore((s) => s.hydrate);
  const currentResumeTitle = useResumeStore((s) => s.currentResume?.title);
  const [jobDescription, setJobDescription] = useState('');
  const [company, setCompany] = useState('');
  const [role, setRole] = useState('');
  // 从投递记录发起时记住来源，分析完可回写 JD、不再重复录入。
  const [sourceApplicationId, setSourceApplicationId] = useState<string | null>(
    null,
  );
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [result, setResult] = useState<JdAnalysisResult | null>(null);
  const [error, setError] = useState('');
  const [isDeriving, setIsDeriving] = useState(false);

  // History state
  const [activeTab, setActiveTab] = useState<string>('new');
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyDetail, setHistoryDetail] = useState<JdAnalysisResult | null>(
    null,
  );
  const [historyDetailJd, setHistoryDetailJd] = useState<string>('');
  const [historyDetailLoading, setHistoryDetailLoading] = useState(false);
  const [deleteToConfirm, setDeleteToConfirm] = useState<string | null>(null);

  const fetchHistory = useCallback(async () => {
    setHistoryLoading(true);
    try {
      const items = await api.listJdAnalyses(resumeId);
      setHistory(items);
    } catch {
      /* ignore */
    } finally {
      setHistoryLoading(false);
    }
  }, [resumeId]);

  // Load history when dialog opens or tab switches to history
  useEffect(() => {
    if (open && activeTab === 'history') {
      fetchHistory();
    }
  }, [open, activeTab, fetchHistory]);

  useEffect(() => {
    if (open) void hydrateJournal();
  }, [open, hydrateJournal]);

  // 从投递记录带 JD 进来：打开时一次性消费预填，用户只需点"开始分析"。
  useEffect(() => {
    if (!open || !toolPrefill) return;
    setJobDescription(toolPrefill.jd || '');
    setCompany(toolPrefill.company || '');
    setRole(toolPrefill.role || '');
    setSourceApplicationId(toolPrefill.applicationId ?? null);
    setResult(null);
    setActiveTab('new');
    setToolPrefill(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  useEffect(() => {
    if (!open || !sourceApplicationId) return;
    const application = applications.find(
      (item) => item.id === sourceApplicationId,
    );
    if (!application) return;
    setCompany((value) => value || application.company);
    setRole((value) => value || application.role);
    setJobDescription((value) => value || application.jd);
  }, [applications, open, sourceApplicationId]);

  const handleAnalyze = async () => {
    if (!jobDescription.trim()) return;
    setIsAnalyzing(true);
    setError('');

    try {
      const data: JdAnalysisResult = await analyzeJD({
        resumeId,
        jobDescription,
        company: company.trim() || undefined,
        role: role.trim() || undefined,
      });
      setResult(data);
      // Refresh history count
      fetchHistory();
    } catch (err: any) {
      setError(err.message || 'Failed to analyze');
    } finally {
      setIsAnalyzing(false);
    }
  };

  const handleAnalyzeAgain = () => {
    setResult(null);
    setJobDescription('');
    setCompany('');
    setRole('');
    setSourceApplicationId(null);
    setError('');
  };

  const handleClose = () => {
    onOpenChange(false);
    setTimeout(() => {
      setResult(null);
      setJobDescription('');
      setCompany('');
      setRole('');
      setSourceApplicationId(null);
      setError('');
      setActiveTab('new');
      setHistoryDetail(null);
      setHistoryDetailJd('');
    }, 200);
  };

  // 分析完顺手记一笔投递：JD 与简历已经关联好，只差公司/岗位。
  const handleRecordApplication = async () => {
    const jd = jobDescription.trim();
    if (sourceApplicationId) {
      updateApplication(sourceApplicationId, { jd });
    } else {
      await createApplication({ resumeId, jd });
    }
    toast.success(t('recorded'));
    onOpenChange(false);
    setTimeout(() => openModal('journal'), 200);
  };

  const buildAnalysisParts = (): string[] => {
    if (!result) return [];
    const parts: string[] = [];
    if (result.missingKeywords.length > 0) {
      parts.push(`缺失关键词：${result.missingKeywords.join('、')}`);
    }
    if (result.suggestions.length > 0) {
      const list = result.suggestions
        .map(
          (s, i) =>
            `${i + 1}. [${s.section}] "${s.current}" → "${s.suggested}"`,
        )
        .join('\n');
      parts.push(`优化建议：\n${list}`);
    }
    return parts;
  };

  const handleOptimize = () => {
    if (!result) return;
    const message = `请根据以下 JD 匹配分析结果优化简历，使其更匹配目标职位：\n\n${buildAnalysisParts().join('\n\n')}\n\n请使用工具直接修改对应的简历模块内容，尽量自然地融入缺失关键词。`;
    onOpenChange(false);
    setTimeout(() => {
      setPendingAiMessage({ text: message, resumeId });
      setRightPaneTab('ai');
    }, 300);
  };

  // 派生一份面向该 JD 的定制简历副本：主简历保持通用，投递用副本可以大胆裁剪。
  const handleDeriveTailored = async () => {
    if (!result || isDeriving) return;
    setIsDeriving(true);
    try {
      const newId = await api.duplicateResume(resumeId);
      const now = new Date();
      const stamp = `${now.getMonth() + 1}.${now.getDate()}`;
      const baseTitle = currentResumeTitle || '简历';
      await api.updateResume(newId, { title: `${baseTitle}·定制 ${stamp}` });

      const jdExcerpt = jobDescription.trim().slice(0, 3000);
      const message = [
        '这是一份为特定 JD 派生的定制简历副本（主简历不受影响），请对它做定向深度优化：',
        '',
        `## 目标 JD\n${jdExcerpt}`,
        '',
        `## 已有的匹配分析\n${buildAnalysisParts().join('\n\n') || '（无）'}`,
        '',
        '要求：',
        '1. 用工具直接修改各模块，自然融入 JD 原词（机筛按原词命中）',
        '2. 与该岗位无关的经历大胆压缩，相关经历扩充细节',
        '3. 遵循"强动词+方法+量化结果"，缺数字用【建议补充：具体数据】占位，绝不编造',
        '4. 完成后总结：改了哪些模块、还需要我人工补充什么',
      ].join('\n');

      setPendingAiMessage({ text: message, resumeId: newId });
      setRightPaneTab('ai');
      onOpenChange(false);
      router.push(`/editor/${newId}`);
    } catch (err: any) {
      logError(t('deriveFailed'), String(err?.message || err).slice(0, 160));
    } finally {
      setIsDeriving(false);
    }
  };

  const handleDeleteHistory = async (id: string) => {
    try {
      await api.deleteJdAnalysis(id);
      setHistory((prev) => prev.filter((h) => h.id !== id));
      if (historyDetail) {
        setHistoryDetail(null);
      }
    } catch {
      /* ignore */
    }
  };

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="sm:max-w-2xl max-h-[85vh] p-0 gap-0 overflow-hidden flex flex-col">
          <DialogHeader className="px-6 pt-6 pb-0">
            <DialogTitle>{t('title')}</DialogTitle>
            <DialogDescription>{t('description')}</DialogDescription>
          </DialogHeader>

          <Tabs
            value={activeTab}
            onValueChange={setActiveTab}
            className="gap-0 min-h-0 flex-1"
          >
            <div className="px-6 pt-3">
              <TabsList className="w-full">
                <TabsTrigger value="new" className="flex-1 cursor-pointer">
                  {t('newAnalysis')}
                </TabsTrigger>
                <TabsTrigger
                  value="history"
                  className="flex-1 cursor-pointer gap-1.5"
                >
                  {t('historyTab')}
                  {history.length > 0 && (
                    <Badge className="ml-1 h-5 min-w-5 px-1 text-xs bg-brand text-white">
                      {history.length}
                    </Badge>
                  )}
                </TabsTrigger>
              </TabsList>
            </div>

            {/* ── New Analysis Tab ── */}
            <TabsContent value="new" className="flex flex-col min-h-0">
              {!result ? (
                <div className="px-6 py-4 space-y-4">
                  <ApplicationContextPicker resumeId={resumeId} value={sourceApplicationId} onChoose={application => { setSourceApplicationId(application.id); setCompany(application.company); setRole(application.role); setJobDescription(application.jd); }} />
                  <details open={!!company || !!role}><summary className="cursor-pointer text-xs text-muted-foreground">公司与岗位（可选）</summary>
                  <div className="grid grid-cols-2 gap-2">
                    <div className="space-y-1">
                      <label className="text-xs text-muted-foreground">
                        {t('company')}
                      </label>
                      <Input
                        value={company}
                        onChange={(event) => setCompany(event.target.value)}
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="text-xs text-muted-foreground">
                        {t('role')}
                      </label>
                      <Input
                        value={role}
                        onChange={(event) => setRole(event.target.value)}
                      />
                    </div>
                  </div>
                  </details>
                  <Textarea
                    placeholder={t('placeholder')}
                    value={jobDescription}
                    onChange={(e) => setJobDescription(e.target.value)}
                    rows={6}
                    className="h-[200px] max-h-[200px] overflow-y-auto resize-none text-sm"
                    disabled={isAnalyzing}
                  />

                  {error && (
                    <div className="flex items-center gap-2 rounded-md bg-red-50 px-3 py-2 text-sm text-red-600">
                      <AlertTriangle className="h-4 w-4 shrink-0" />
                      {error}
                    </div>
                  )}

                  <div className="flex justify-end gap-2">
                    <Button
                      variant="outline"
                      onClick={handleClose}
                      className="cursor-pointer"
                    >
                      {t('close')}
                    </Button>
                    <Button
                      onClick={handleAnalyze}
                      disabled={isAnalyzing || !jobDescription.trim()}
                      variant="primary" className="cursor-pointer"
                    >
                      {isAnalyzing ? (
                        <>
                          <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
                          {t('analyzing')}
                        </>
                      ) : (
                        t('analyze')
                      )}
                    </Button>
                  </div>
                </div>
              ) : (
                <>
                  <div className="flex-1 min-h-0 overflow-y-auto">
                    <JdAnalysisResultView
                      result={result}
                      jobDescription={jobDescription}
                      t={t}
                    />
                  </div>
                  <div className="flex justify-end gap-2 px-6 pb-5 pt-3">
                    <Button
                      variant="outline"
                      onClick={handleClose}
                      className="cursor-pointer"
                    >
                      {t('close')}
                    </Button>
                    <Button
                      variant="outline"
                      onClick={handleAnalyzeAgain}
                      className="cursor-pointer gap-1.5"
                    >
                      <RotateCcw className="h-3.5 w-3.5" />
                      {t('analyzeAgain')}
                    </Button>
                    <Button
                      variant="outline"
                      onClick={() => void handleRecordApplication()}
                      className="cursor-pointer gap-1.5"
                      title={
                        sourceApplicationId
                          ? t('recordApplicationUpdateHint')
                          : t('recordApplicationHint')
                      }
                    >
                      <BookOpenCheck className="h-3.5 w-3.5" />
                      {sourceApplicationId
                        ? t('recordApplicationUpdate')
                        : t('recordApplication')}
                    </Button>
                    {(result.suggestions.length > 0 ||
                      result.missingKeywords.length > 0) && (
                      <>
                        <Button
                          variant="outline"
                          onClick={() => void handleDeriveTailored()}
                          disabled={isDeriving}
                          className="cursor-pointer gap-1.5"
                          title={t('deriveTailoredHint')}
                        >
                          {isDeriving ? (
                            <Loader2 className="h-3.5 w-3.5 animate-spin" />
                          ) : (
                            <CopyPlus className="h-3.5 w-3.5" />
                          )}
                          {t('deriveTailored')}
                        </Button>
                        <Button
                          onClick={handleOptimize}
                          variant="primary" className="cursor-pointer gap-1.5"
                        >
                          <Wand2 className="h-3.5 w-3.5" />
                          {t('optimize')}
                        </Button>
                      </>
                    )}
                  </div>
                </>
              )}
            </TabsContent>

            {/* ── History Tab ── */}
            <TabsContent value="history" className="flex flex-col min-h-0">
              {historyDetail ? (
                /* Detail View */
                <>
                  <div className="px-6 pt-2">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => {
                        setHistoryDetail(null);
                        setHistoryDetailJd('');
                      }}
                      className="cursor-pointer gap-1 text-muted-foreground -ml-2"
                    >
                      <ChevronLeft className="h-4 w-4" />
                      {t('historyTab')}
                    </Button>
                  </div>
                  <div className="flex-1 min-h-0 overflow-y-auto">
                    <JdAnalysisResultView
                      result={historyDetail}
                      jobDescription={historyDetailJd}
                      t={t}
                    />
                  </div>
                  <div className="flex justify-end gap-2 px-6 pb-5 pt-3">
                    <Button
                      variant="outline"
                      onClick={handleClose}
                      className="cursor-pointer"
                    >
                      {t('close')}
                    </Button>
                  </div>
                </>
              ) : historyLoading ? (
                <div className="flex flex-col items-center justify-center py-12">
                  <Loader2 className="h-6 w-6 animate-spin text-brand mb-2" />
                  <p className="text-sm text-muted-foreground">
                    {t('loadingHistory')}
                  </p>
                </div>
              ) : history.length === 0 ? (
                /* Empty State */
                <div className="flex flex-col items-center justify-center py-12 px-6">
                  <FileSearch className="h-12 w-12 text-muted-foreground mb-3" />
                  <p className="text-sm text-muted-foreground">
                    {t('noHistory')}
                  </p>
                </div>
              ) : (
                /* History List */
                <>
                  <div className="flex-1 min-h-0 overflow-y-auto">
                    <div className="px-6 py-4 space-y-2.5">
                      {history.map((item, idx) => {
                        const prevScore =
                          idx < history.length - 1
                            ? history[idx + 1].overallScore
                            : undefined;
                        return (
                          <div
                            key={item.id}
                            className="group flex items-center gap-3 rounded-lg border border-border bg-card p-3 transition-colors hover:bg-muted/50 cursor-pointer"
                            onClick={async () => {
                              setHistoryDetailLoading(true);
                              try {
                                const data = await api.getJdAnalysis(item.id);
                                if (data?.result) {
                                  setHistoryDetail(
                                    typeof data.result === 'string'
                                      ? JSON.parse(data.result)
                                      : data.result,
                                  );
                                  setHistoryDetailJd(data.jobDescription || '');
                                }
                              } catch {
                                /* ignore */
                              } finally {
                                setHistoryDetailLoading(false);
                              }
                            }}
                          >
                            {/* Score circle */}
                            <div className="flex items-center gap-1">
                              <ScoreCircle
                                score={item.overallScore}
                                label=""
                                size="sm"
                              />
                              <ScoreTrend
                                current={item.overallScore}
                                previous={prevScore}
                              />
                            </div>

                            {/* Info */}
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2">
                                <span className="text-xs text-muted-foreground">
                                  {formatDate(item.createdAt)}
                                </span>
                                <Badge variant="secondary" className="text-xs">
                                  ATS {item.atsScore}
                                </Badge>
                              </div>
                              <p className="text-sm text-[var(--app-text-secondary)] truncate mt-0.5">
                                {item.jobDescription}
                              </p>
                            </div>

                            {/* Delete button */}
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                setDeleteToConfirm(item.id);
                              }}
                              className="opacity-0 group-hover:opacity-100 p-1.5 rounded-md text-muted-foreground hover:text-red-500 hover:bg-red-50 transition-all cursor-pointer"
                            >
                              <Trash2 className="h-4 w-4" />
                            </button>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                  <div className="flex justify-end gap-2 px-6 pb-5 pt-3">
                    <Button
                      variant="outline"
                      onClick={handleClose}
                      className="cursor-pointer"
                    >
                      {t('close')}
                    </Button>
                  </div>
                </>
              )}
              {historyDetailLoading && !historyDetail && (
                <div className="absolute inset-0 flex items-center justify-center bg-card/50">
                  <Loader2 className="h-6 w-6 animate-spin text-brand" />
                </div>
              )}
            </TabsContent>
          </Tabs>
        </DialogContent>
      </Dialog>

      <AlertDialog
        open={!!deleteToConfirm}
        onOpenChange={(o) => {
          if (!o) setDeleteToConfirm(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('deleteConfirm')}</AlertDialogTitle>
            <AlertDialogDescription>
              {t('deleteConfirmDesc')}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="cursor-pointer">
              {ct('cancel')}
            </AlertDialogCancel>
            <AlertDialogAction
              variant="destructive" className="cursor-pointer"
              onClick={() => {
                if (deleteToConfirm) handleDeleteHistory(deleteToConfirm);
                setDeleteToConfirm(null);
              }}
            >
              {ct('delete')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
