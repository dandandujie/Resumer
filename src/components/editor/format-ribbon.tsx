'use client';

import { useCallback, useRef } from 'react';
import { useTranslations } from 'next-intl';
import { RotateCcw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Slider } from '@/components/ui/slider';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import {
  DEFAULT_THEME,
  FONT_SCHEMES,
  FONT_SIZE_STEPS,
  MAX_PAGE_MARGIN_MM,
  MAX_THEME_FONT_SIZE,
  MIN_THEME_FONT_SIZE,
  THEME_PRESETS,
  matchPreset,
  pxToPt,
  resolveTheme,
  type FontSchemeId,
} from '@/lib/theme-config';
import { useResumeStore } from '@/stores/resume-store';
import { useEditorStore } from '@/stores/editor-store';
import type { ThemeConfig } from '@/types/resume';
import { cn } from '@/lib/utils';

export function FormatRibbon() {
  const t = useTranslations('themeEditor');
  const currentResume = useResumeStore((state) => state.currentResume);
  const updateThemeConfig = useResumeStore((state) => state.updateThemeConfig);
  const pushSnapshot = useEditorStore((state) => state.pushSnapshot);
  const theme = resolveTheme(currentResume?.themeConfig);
  const isEnglish = currentResume?.language === 'en';
  // 滑杆拖动期间只在第一次变化时入栈一次，松手后清除标记；否则一次拖动会塞进几十条撤销记录。
  const dragging = useRef(false);

  const updateTheme = useCallback(
    (updates: Partial<ThemeConfig>, { continuous = false } = {}) => {
      if (!currentResume) return;
      if (!continuous || !dragging.current) {
        pushSnapshot(useResumeStore.getState().sections);
        dragging.current = continuous;
      }
      updateThemeConfig({ ...theme, ...updates });
    },
    [currentResume, pushSnapshot, theme, updateThemeConfig],
  );
  const endDrag = () => {
    dragging.current = false;
  };
  const setMargin = (side: keyof typeof theme.margin, value: number) =>
    updateTheme({
      margin: { ...theme.margin, [side]: Math.max(0, Math.min(MAX_PAGE_MARGIN_MM, value)) },
    });
  const activePreset = matchPreset(theme);
  const activeStep = FONT_SIZE_STEPS.find((step) => step.px === theme.fontSize);
  const fontSizeLabel = activeStep
    ? t(`fontSizeStep.${activeStep.key}`)
    : t('fontSizeStep.custom', { pt: pxToPt(theme.fontSize) });

  const control = (label: string, content: React.ReactNode) => (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          className="h-7 shrink-0 cursor-pointer text-xs"
        >
          {label}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-60 space-y-3">
        {content}
      </PopoverContent>
    </Popover>
  );

  return (
    <div
      className={cn(
        'flex min-w-0 items-center gap-1 overflow-x-auto border-b',
        'border-[var(--whale-divider)] bg-[var(--whale-card)] px-3 py-1.5',
      )}
      role="toolbar"
      aria-label={t('title')}
    >
      {control(
        `${t('presets')}${activePreset ? ` · ${t(`preset.${activePreset}`)}` : ''}`,
        <div className="grid grid-cols-2 gap-1.5">
          {Object.keys(THEME_PRESETS).map((id) => (
            <Button
              key={id}
              variant={activePreset === id ? 'default' : 'outline'}
              size="sm"
              className="h-8 cursor-pointer text-xs"
              onClick={() => updateTheme(THEME_PRESETS[id])}
              aria-pressed={activePreset === id}
            >
              {t(`preset.${id}`)}
            </Button>
          ))}
        </div>,
      )}
      {control(
        `${t('fontFamily')} · ${t(`fontScheme.${theme.fontScheme}`)}`,
        <Select
          value={theme.fontScheme}
          onValueChange={(value) => updateTheme({ fontScheme: value as FontSchemeId })}
        >
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {(Object.keys(FONT_SCHEMES) as FontSchemeId[])
              .filter((id) => isEnglish || !FONT_SCHEMES[id].latinOnly || id === theme.fontScheme)
              .map((id) => (
                <SelectItem key={id} value={id}>
                  {t(`fontScheme.${id}`)}
                </SelectItem>
              ))}
          </SelectContent>
        </Select>,
      )}
      {control(
        `${t('fontSizeLabel')} · ${fontSizeLabel}`,
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-1.5">
            {FONT_SIZE_STEPS.map((step) => (
              <Button
                key={step.key}
                variant={theme.fontSize === step.px ? 'default' : 'outline'}
                size="sm"
                className="h-8 cursor-pointer text-xs"
                onClick={() => updateTheme({ fontSize: step.px })}
                aria-pressed={theme.fontSize === step.px}
              >
                {t(`fontSizeStep.${step.key}`)}
              </Button>
            ))}
          </div>
          <Slider
            value={[theme.fontSize]}
            min={MIN_THEME_FONT_SIZE}
            max={MAX_THEME_FONT_SIZE}
            step={0.5}
            onValueChange={([value]) => updateTheme({ fontSize: value }, { continuous: true })}
            onValueCommit={endDrag}
            aria-label={t('fontSizeLabel')}
          />
        </div>,
      )}
      {control(
        `${t('lineSpacing')} · ${theme.lineSpacing.toFixed(2)}`,
        <Slider
          value={[theme.lineSpacing]}
          min={1}
          max={2}
          step={0.05}
          onValueChange={([value]) => updateTheme({ lineSpacing: value }, { continuous: true })}
          onValueCommit={endDrag}
          aria-label={t('lineSpacing')}
        />,
      )}
      {control(
        `${t('sectionSpacing')} · ${theme.sectionSpacing}px`,
        <Slider
          value={[theme.sectionSpacing]}
          min={0}
          max={24}
          step={1}
          onValueChange={([value]) => updateTheme({ sectionSpacing: value }, { continuous: true })}
          onValueCommit={endDrag}
          aria-label={t('sectionSpacing')}
        />,
      )}
      {control(
        `${t('pageMargin')} (mm)`,
        <div className="grid grid-cols-4 gap-1">
          {(['top', 'right', 'bottom', 'left'] as const).map((side) => (
            <label key={side} className="text-center text-[10px] text-muted-foreground">
              {t(`margin.${side}`)}
              <Input
                type="number"
                min={0}
                max={MAX_PAGE_MARGIN_MM}
                value={theme.margin[side]}
                onChange={(event) => setMargin(side, Number(event.target.value))}
                className="mt-0.5 h-7 px-1 text-center text-xs"
              />
            </label>
          ))}
        </div>,
      )}
      {control(
        t('headingStyle'),
        <Select
          value={theme.headingStyle}
          onValueChange={(value) =>
            updateTheme({ headingStyle: value as ThemeConfig['headingStyle'] })
          }
        >
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="underline">{t('headingUnderline')}</SelectItem>
            <SelectItem value="plain">{t('headingPlain')}</SelectItem>
            <SelectItem value="filled">{t('headingFilled')}</SelectItem>
          </SelectContent>
        </Select>,
      )}
      {control(
        t('dateStyle'),
        <Select
          value={theme.dateStyle}
          onValueChange={(value) =>
            updateTheme({ dateStyle: value as ThemeConfig['dateStyle'] })
          }
        >
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="dot">2022.07</SelectItem>
            <SelectItem value="dash">2022-07</SelectItem>
            <SelectItem value="cn">2022年7月</SelectItem>
          </SelectContent>
        </Select>,
      )}
      {control(
        t('colors'),
        <div className="grid grid-cols-2 gap-2">
          <label className="text-xs">
            {t('titleColor')}
            <Input
              type="color"
              value={theme.primaryColor}
              // 标题色与分隔线色对用户是同一个概念，一起改；不再出现蓝标题配黑线。
              onChange={(event) =>
                updateTheme({ primaryColor: event.target.value, accentColor: event.target.value }, { continuous: true })
              }
              onBlur={endDrag}
              className="mt-1 h-8 p-1"
            />
          </label>
          <label className="text-xs">
            {t('bodyColor')}
            <Input
              type="color"
              value={theme.bodyColor}
              onChange={(event) => updateTheme({ bodyColor: event.target.value }, { continuous: true })}
              onBlur={endDrag}
              className="mt-1 h-8 p-1"
            />
          </label>
        </div>,
      )}
      <Button
        variant="ghost"
        size="icon-xs"
        onClick={() => updateTheme(DEFAULT_THEME)}
        title={t('reset')}
        aria-label={t('reset')}
        className="cursor-pointer"
      >
        <RotateCcw className="h-3.5 w-3.5" />
      </Button>
    </div>
  );
}
