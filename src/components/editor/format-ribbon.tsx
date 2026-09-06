'use client';

import { useCallback } from 'react';
import { useTranslations } from 'next-intl';
import { RotateCcw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Slider } from '@/components/ui/slider';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { FONT_SCHEMES, FONT_SIZE_STEPS, THEME_PRESETS, resolveTheme } from '@/lib/theme-config';
import { useResumeStore } from '@/stores/resume-store';
import type { ThemeConfig } from '@/types/resume';

export function FormatRibbon() {
  const t = useTranslations('themeEditor');
  const currentResume = useResumeStore((state) => state.currentResume);
  const theme = resolveTheme(currentResume?.themeConfig);
  const updateTheme = useCallback((updates: Partial<ThemeConfig>) => {
    if (!currentResume) return;
    useResumeStore.setState((state) => ({ currentResume: state.currentResume ? { ...state.currentResume, themeConfig: { ...theme, ...updates } } : null, isDirty: true }));
    useResumeStore.getState()._scheduleSave();
  }, [currentResume, theme]);
  const setMargin = (side: keyof typeof theme.margin, value: number) => updateTheme({ margin: { ...theme.margin, [side]: Math.max(0, Math.min(40, value)) } });
  const control = (label: string, content: React.ReactNode) => (
    <Popover><PopoverTrigger asChild><Button variant="ghost" size="sm" className="h-7 shrink-0 cursor-pointer text-xs">{label}</Button></PopoverTrigger><PopoverContent align="start" className="w-60 space-y-3">{content}</PopoverContent></Popover>
  );

  return (
    <div className="flex min-w-0 items-center gap-1 overflow-x-auto border-b border-[var(--whale-divider)] bg-[var(--whale-card)] px-3 py-1.5">
      {control(t('presets'), <div className="grid grid-cols-2 gap-1.5">{Object.entries(THEME_PRESETS).map(([id, preset]) => <Button key={id} variant="outline" size="sm" className="h-8 text-xs" onClick={() => updateTheme(preset.config)}>{preset.label}</Button>)}</div>)}
      {control(t('fontFamily'), <Select value={theme.fontScheme} onValueChange={(value) => updateTheme({ fontScheme: value as keyof typeof FONT_SCHEMES })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{Object.entries(FONT_SCHEMES).map(([id, font]) => <SelectItem key={id} value={id}>{font.label}</SelectItem>)}</SelectContent></Select>)}
      {control(`${t('fontSizeLabel')} · ${FONT_SIZE_STEPS.find((step) => step.px === theme.fontSize)?.label || `${theme.fontSize}px`}`, <Slider value={[theme.fontSize]} min={10} max={20} step={0.5} onValueChange={([value]) => updateTheme({ fontSize: value })} />)}
      {control(`${t('lineSpacing')} · ${theme.lineSpacing.toFixed(2)}`, <Slider value={[theme.lineSpacing]} min={1} max={2} step={0.05} onValueChange={([value]) => updateTheme({ lineSpacing: value })} />)}
      {control(`${t('sectionSpacing')} · ${theme.sectionSpacing}px`, <Slider value={[theme.sectionSpacing]} min={0} max={24} step={1} onValueChange={([value]) => updateTheme({ sectionSpacing: value })} />)}
      {control(`${t('pageMargin')} (mm)`, <div className="grid grid-cols-4 gap-1">{(['top', 'right', 'bottom', 'left'] as const).map((side) => <Input key={side} type="number" value={theme.margin[side]} onChange={(event) => setMargin(side, Number(event.target.value))} className="h-7 px-1 text-center text-xs" />)}</div>)}
      {control(t('headingStyle'), <Select value={theme.headingStyle} onValueChange={(value) => updateTheme({ headingStyle: value as ThemeConfig['headingStyle'] })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="underline">{t('headingUnderline')}</SelectItem><SelectItem value="plain">{t('headingPlain')}</SelectItem><SelectItem value="filled">{t('headingFilled')}</SelectItem></SelectContent></Select>)}
      {control(t('dateStyle'), <Select value={theme.dateStyle} onValueChange={(value) => updateTheme({ dateStyle: value as ThemeConfig['dateStyle'] })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="dot">2022.07</SelectItem><SelectItem value="dash">2022-07</SelectItem><SelectItem value="cn">2022年7月</SelectItem></SelectContent></Select>)}
      {control(t('primaryColor'), <div className="grid grid-cols-2 gap-2"><label className="text-xs">{t('primaryColor')}<Input type="color" value={theme.primaryColor} onChange={(event) => updateTheme({ primaryColor: event.target.value })} className="mt-1 h-8 p-1" /></label><label className="text-xs">{t('bodyColor')}<Input type="color" value={theme.bodyColor} onChange={(event) => updateTheme({ bodyColor: event.target.value })} className="mt-1 h-8 p-1" /></label></div>)}
      <Button variant="ghost" size="icon-xs" onClick={() => updateTheme(resolveTheme())} title={t('reset')}><RotateCcw className="h-3.5 w-3.5" /></Button>
    </div>
  );
}
