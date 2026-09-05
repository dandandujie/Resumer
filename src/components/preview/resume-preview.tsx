'use client';

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
    <div data-theme-scope={scopeId} data-avatar-style={theme.avatarStyle}>
      <style dangerouslySetInnerHTML={{ __html: buildThemeCss(scope, theme, { export: exportMode }) }} />
      <TemplateComponent resume={themedResume} interactive={interactive} onReorderSections={onReorderSections} />
    </div>
  );
}
