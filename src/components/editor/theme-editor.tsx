'use client';

import { useCallback } from 'react';
import { RotateCcw } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Slider } from '@/components/ui/slider';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { FONT_SCHEMES, FONT_SIZE_STEPS, THEME_PRESETS, resolveTheme } from '@/lib/theme-config';
import { useResumeStore } from '@/stores/resume-store';
import type { ThemeConfig } from '@/types/resume';

export function ThemeEditor() {
  const t = useTranslations('themeEditor');
  const { currentResume } = useResumeStore();
  const theme = resolveTheme(currentResume?.themeConfig);
  const updateTheme = useCallback((updates: Partial<ThemeConfig>) => {
    if (!currentResume) return;
    useResumeStore.setState((state) => ({ currentResume: state.currentResume ? { ...state.currentResume, themeConfig: { ...theme, ...updates } } : null, isDirty: true }));
    useResumeStore.getState()._scheduleSave();
  }, [currentResume, theme]);
  const applyPreset = (id: string) => updateTheme(THEME_PRESETS[id].config);
  const setMargin = (side: keyof typeof theme.margin, value: number) => updateTheme({ margin: { ...theme.margin, [side]: Math.max(0, Math.min(40, value)) } });

  return <div className="flex h-full w-72 shrink-0 flex-col border-l border-[var(--whale-divider)] bg-[var(--whale-card)]">
    <div className="flex items-center justify-between border-b border-[var(--whale-divider)] px-4 py-3"><h3 className="text-sm font-semibold">{t('title')}</h3><Button variant="ghost" size="icon-xs" onClick={() => updateTheme(resolveTheme())} title={t('reset')}><RotateCcw className="h-3.5 w-3.5" /></Button></div>
    <div className="space-y-4 overflow-auto p-4">
      <div><label className="mb-2 block text-xs font-medium">{t('presets')}</label><div className="grid grid-cols-2 gap-1.5">{Object.entries(THEME_PRESETS).map(([id, preset]) => <Button key={id} variant="outline" size="sm" className="h-8 text-xs" onClick={() => applyPreset(id)}>{preset.label}</Button>)}</div></div>
      <div className="space-y-2"><label className="block text-xs font-medium">{t('fontFamily')}</label><Select value={theme.fontScheme} onValueChange={(v) => updateTheme({ fontScheme: v as keyof typeof FONT_SCHEMES })}><SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger><SelectContent>{Object.entries(FONT_SCHEMES).map(([id, font]) => <SelectItem key={id} value={id}>{font.label}</SelectItem>)}</SelectContent></Select></div>
      <div className="space-y-2"><label className="block text-xs font-medium">{t('fontSizeLabel')} · {FONT_SIZE_STEPS.find((step) => step.px === theme.fontSize)?.label || `${theme.fontSize}px`}</label><Slider value={[theme.fontSize]} min={10} max={20} step={0.5} onValueChange={([v]) => updateTheme({ fontSize: v })} /></div>
      <div className="space-y-2"><label className="block text-xs font-medium">{t('lineSpacing')} · {theme.lineSpacing.toFixed(2)}</label><Slider value={[theme.lineSpacing]} min={1} max={2} step={0.05} onValueChange={([v]) => updateTheme({ lineSpacing: v })} /></div>
      <div className="space-y-2"><label className="block text-xs font-medium">{t('sectionSpacing')} · {theme.sectionSpacing}px</label><Slider value={[theme.sectionSpacing]} min={0} max={24} step={1} onValueChange={([v]) => updateTheme({ sectionSpacing: v })} /></div>
      <div><label className="mb-2 block text-xs font-medium">{t('pageMargin')} (mm)</label><div className="grid grid-cols-4 gap-1">{(['top','right','bottom','left'] as const).map((side) => <Input key={side} type="number" value={theme.margin[side]} onChange={(e) => setMargin(side, Number(e.target.value))} className="h-7 px-1 text-center text-xs" />)}</div></div>
      <div className="grid grid-cols-2 gap-2"><label className="text-xs">{t('primaryColor')}<Input type="color" value={theme.primaryColor} onChange={(e) => updateTheme({ primaryColor: e.target.value })} className="mt-1 h-8 p-1" /></label><label className="text-xs">{t('bodyColor')}<Input type="color" value={theme.bodyColor} onChange={(e) => updateTheme({ bodyColor: e.target.value })} className="mt-1 h-8 p-1" /></label></div>
    </div>
  </div>;
}
