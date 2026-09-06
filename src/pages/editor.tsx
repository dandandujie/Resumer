import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { logError } from '@/stores/error-log-store';
import { useEditor } from '@/hooks/use-editor';
import { useIsMobile } from '@/hooks/use-media-query';
import { EditorToolbar } from '@/components/editor/editor-toolbar';
import { EditorSidebar } from '@/components/editor/editor-sidebar';
import { EditorRightPane } from '@/components/editor/editor-right-pane';
import { ThemeEditor } from '@/components/editor/theme-editor';
import { EditorPreviewPanel } from '@/components/editor/editor-preview-panel';
import { EditorMobileTabBar } from '@/components/editor/editor-mobile-tab-bar';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { List } from "lucide-react";
import { SettingsDialog } from '@/components/settings/settings-dialog';
import { JdAnalysisDialog } from '@/components/editor/jd-analysis-dialog';
import { TranslateDialog } from '@/components/editor/translate-dialog';
import { ExportDialog } from '@/components/editor/export-dialog';
import { GrammarCheckDialog } from '@/components/editor/grammar-check-dialog';
import { CoverLetterDialog } from '@/components/editor/cover-letter-dialog';
import { InterviewDialog } from '@/components/editor/interview-dialog';
import { JournalDialog } from '@/components/editor/journal-dialog';
import { useEditorStore } from '@/stores/editor-store';
import { useResumeStore } from '@/stores/resume-store';
import { useUIStore } from '@/stores/ui-store';
import { useSettingsStore } from '@/stores/settings-store';
import { useJournalStore } from '@/stores/journal-store';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';

export default function EditorPage() {
  const { id } = useParams<{ id: string }>();
  const { resume, sections, updateSection, addSection, removeSection, reorderSections } = useEditor(id!);
  const isMobile = useIsMobile();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const { showThemeEditor, mobileActiveTab } = useEditorStore();
  const { activeModal, openModal, closeModal } = useUIStore();
  const { hydrate, _hydrated } = useSettingsStore();
  const hydrateJournal = useJournalStore((s) => s.hydrate);
  const pendingModal = useEditorStore((s) => s.pendingModal);
  const setPendingModal = useEditorStore((s) => s.setPendingModal);

  useEffect(() => {
    if (!_hydrated) hydrate();
  }, [_hydrated, hydrate]);

  // 投递记录里的 AI 动作依赖这份简历的投递上下文；提前把数据拉好。
  useEffect(() => {
    void hydrateJournal();
  }, [hydrateJournal]);

  // 从求职动态页跳转进来时，把它要求打开的对话框（JD 匹配 / 求职文案 / 模拟面试）打开。
  useEffect(() => {
    if (resume && pendingModal) {
      openModal(pendingModal);
      setPendingModal(null);
    }
  }, [resume, pendingModal, openModal, setPendingModal]);

  // Keyboard shortcuts: Cmd/Ctrl+S save, Cmd/Ctrl+Z undo, Cmd/Ctrl+Shift+Z redo.
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (!(e.metaKey || e.ctrlKey)) return;
      const key = e.key.toLowerCase();
      if (key === 's') {
        e.preventDefault();
        void useResumeStore.getState().flushPendingSave();
        return;
      }
      if (key !== 'z') return;
      // Leave native text-level undo alone while typing in a field.
      const target = e.target as HTMLElement | null;
      const isEditable =
        !!target &&
        (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable);
      if (isEditable) return;
      e.preventDefault();
      const editor = useEditorStore.getState();
      const resumeStore = useResumeStore.getState();
      const snapshot = e.shiftKey
        ? editor.redo(resumeStore.sections)
        : editor.undo(resumeStore.sections);
      if (snapshot) {
        resumeStore.reorderSections(snapshot.sections);
        if (snapshot.themeConfig) resumeStore.updateThemeConfig(snapshot.themeConfig);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  useEffect(() => {
    const handler = (e: PromiseRejectionEvent) => {
      const msg = e.reason?.message || String(e.reason || '');
      if (msg.includes('AI_RetryError') || msg.includes('AI_APICallError')) {
        e.preventDefault();
        logError('操作失败', 'AI 服务暂时不可用，请稍后重试');
      }
    };
    window.addEventListener('unhandledrejection', handler);
    return () => window.removeEventListener('unhandledrejection', handler);
  }, []);

  if (!resume) {
    return (
      <div className="flex h-screen items-center justify-center">
        <div className="space-y-4 w-64">
          <Skeleton className="h-8 w-full" />
          <Skeleton className="h-4 w-3/4" />
          <Skeleton className="h-64 w-full" />
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-screen flex-col">
      <EditorToolbar />
      <EditorMobileTabBar />

      <div className="flex flex-1 overflow-hidden">
        <div className="hidden md:block">
          <EditorSidebar sections={sections} onAddSection={addSection} onReorderSections={reorderSections} />
        </div>

        <div className={cn("min-w-0 flex-1 overflow-hidden md:flex-[6]", isMobile && mobileActiveTab !== "preview" && "hidden")}>
          <EditorPreviewPanel />
        </div>

        {showThemeEditor && <ThemeEditor />}

        <div className={cn("min-w-0 flex-1 overflow-hidden md:flex-[4]", isMobile && mobileActiveTab !== "edit" && "hidden")}>
          <EditorRightPane resumeId={id!} sections={sections} onUpdateSection={updateSection} onRemoveSection={removeSection} />
        </div>
      </div>

      <button onClick={() => setSidebarOpen(true)} className="fixed bottom-20 left-4 z-40 flex h-12 w-12 items-center justify-center rounded-full bg-[var(--whale-ink)] text-[var(--whale-cream)] shadow-lg transition-transform hover:scale-105 active:scale-95 md:hidden" aria-label="Open sections">
        <List className="h-5 w-5" />
      </button>

      <Sheet open={sidebarOpen} onOpenChange={setSidebarOpen}>
        <SheetContent side="left" className="w-72 border-r border-[var(--whale-divider)] bg-[var(--whale-sidebar)] p-0">
          <SheetHeader className="border-b border-[var(--whale-divider)] px-4 py-3">
            <SheetTitle className="text-sm font-semibold text-[var(--whale-ink)]">Sections</SheetTitle>
          </SheetHeader>
          <EditorSidebar sections={sections} onAddSection={(s) => { addSection(s); setSidebarOpen(false); }} onReorderSections={reorderSections} />
        </SheetContent>
      </Sheet>

      <SettingsDialog />
      <JdAnalysisDialog open={activeModal === 'jd-analysis'} onOpenChange={(open) => open ? openModal('jd-analysis') : closeModal()} resumeId={id!} />
      <TranslateDialog open={activeModal === 'translate'} onOpenChange={(open) => open ? openModal('translate') : closeModal()} resumeId={id!} />
      <ExportDialog open={activeModal === 'export'} onOpenChange={(open) => open ? openModal('export') : closeModal()} resumeId={id!} />
      <GrammarCheckDialog open={activeModal === 'grammar-check'} onOpenChange={(open) => open ? openModal('grammar-check') : closeModal()} resumeId={id!} />
      <CoverLetterDialog open={activeModal === 'cover-letter'} onOpenChange={(open) => open ? openModal('cover-letter') : closeModal()} resumeId={id!} />
      <JournalDialog open={activeModal === 'journal'} onOpenChange={(open) => open ? openModal('journal') : closeModal()} resumeId={id!} />
      <InterviewDialog />
    </div>
  );
}
