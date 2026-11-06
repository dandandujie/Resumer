'use client';

import { useEditorStore } from '@/stores/editor-store';
import { useId } from 'react';
import type { Resume, ResumeSection } from '@/types/resume';
import { buildThemeCss, resolveTheme } from '@/lib/theme-config';
import { ClassicTemplate } from './templates/classic';
import { ModernTemplate } from './templates/modern';

interface ResumePreviewProps {
  resume: Resume;
  interactive?: boolean;
  exportMode?: boolean;
  onReorderSections?: (sections: ResumeSection[]) => void;
}

export function ResumePreview({ resume, interactive, exportMode, onReorderSections }: ResumePreviewProps) {
  const scopeId = useId();
  const safeResume = resume.sections ? resume : { ...resume, sections: [] };
  const theme = resolveTheme(safeResume.themeConfig);
  const themedResume = { ...safeResume, themeConfig: theme } as Resume;
  const TemplateComponent = themedResume.template === 'modern' ? ModernTemplate : ClassicTemplate;
  const scope = `[data-theme-scope="${scopeId}"]`;

  return (
    <div
      data-theme-scope={scopeId}
      onClickCapture={interactive ? event => {
        if (!useEditorStore.getState().showThemeEditor) return;
        const target = event.target as HTMLElement;
        const templatePart = target.closest('[data-personal-heading], [data-personal-contacts], [data-modern-heading], [data-modern-contacts]') ? 'header' : target.closest('h2,h3') ? 'headings' : 'body';
        useEditorStore.setState({templatePart, mobileActiveTab: 'edit'});
        event.stopPropagation();
      } : undefined}
      data-avatar-style={theme.avatarStyle}
      // 文档是独立的浅色画布，不能继承工作区深色的默认文本/原生控件颜色。
      style={{ colorScheme: 'only light', color: theme.bodyColor, backgroundColor: '#fff' }}
    >
      <style dangerouslySetInnerHTML={{ __html: buildThemeCss(scope, theme, { export: exportMode }) }} />
      <TemplateComponent resume={themedResume} interactive={interactive} onReorderSections={onReorderSections} />
    </div>
  );
}
