'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslations } from 'next-intl';
import { Plus, RotateCcw, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { useThemePresetsStore, type CustomThemePreset } from '@/stores/theme-presets-store';
import { AlertDialog, AlertDialogContent, AlertDialogHeader, AlertDialogTitle, AlertDialogDescription, AlertDialogFooter, AlertDialogCancel, AlertDialogAction } from '@/components/ui/alert-dialog';
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
  CJK_FONTS,
  DEFAULT_LATIN_FOR,
  DEFAULT_THEME,
  FONT_SIZE_STEPS,
  LATIN_FONTS,
  MAX_PAGE_MARGIN_MM,
  MAX_THEME_FONT_SIZE,
  MIN_THEME_FONT_SIZE,
  THEME_PRESETS,
  matchPreset,
  pxToPt,
  resolveTheme,
  type FontSchemeId,
  type LatinFontId,
} from '@/lib/theme-config';
import { useResumeStore } from '@/stores/resume-store';
import { useEditorStore } from '@/stores/editor-store';
import type { ThemeConfig } from '@/types/resume';

export function FormatRibbon() {
  const t = useTranslations('themeEditor');
  const tc = useTranslations('common');
  const { presets, loaded, loading, loadError, saving, load, add, remove } = useThemePresetsStore();
  const [addingPreset, setAddingPreset] = useState(false);
  const [presetName, setPresetName] = useState('');
  const [pendingDelete, setPendingDelete] = useState<CustomThemePreset | null>(null);
  useEffect(() => { void load(); }, [load]);
  const currentResume = useResumeStore((state) => state.currentResume);
  const updateThemeConfig = useResumeStore((state) => state.updateThemeConfig);
  const pushSnapshot = useEditorStore((state) => state.pushSnapshot);
  const theme = resolveTheme(currentResume?.themeConfig);
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
  const activePreset = matchPreset(theme, { ...Object.fromEntries(presets.map((preset) => [preset.id, preset.theme])), ...THEME_PRESETS });
  const duplicateName = ['标准', 'standard', ...presets.map((preset) => preset.name.toLowerCase())].includes(presetName.trim().toLowerCase());
  const savePreset = async () => {
    if (!presetName.trim() || duplicateName || saving) return;
    try {
      await add(presetName, theme);
      setAddingPreset(false);
      setPresetName('');
      toast.success(t('custom.saved'));
    } catch { toast.error(t('custom.saveFailed')); }
  };
  const activeStep = FONT_SIZE_STEPS.find((step) => step.px === theme.fontSize);
  const fontSizeLabel = activeStep
    ? t(`fontSizeStep.${activeStep.key}`)
    : t('fontSizeStep.custom', { pt: pxToPt(theme.fontSize) });

  const control = (label: string, content: React.ReactNode) => (
    <section className="space-y-3 border-b border-[var(--whale-divider)] pb-5 last:border-0">
      <h3 className="text-sm font-semibold text-[var(--whale-ink)]">{label}</h3>
      {content}
    </section>
  );

  return (
    <div className="h-full overflow-y-auto p-5" role="region" aria-label={t('title')}>
      <p className="mb-5 text-xs leading-5 text-muted-foreground">{t('panelHint')}</p>
      <div className="space-y-5">
      {control(
        t('presets'),
        <div className="space-y-3">
          <Button variant={activePreset === 'standard' ? 'default' : 'outline'} className="w-full justify-start" onClick={() => updateTheme(THEME_PRESETS.standard)} aria-pressed={activePreset === 'standard'}>{t('preset.standard')}</Button>
          {presets.map((preset) => (
            <div key={preset.id} className="flex items-center gap-2">
              <Button variant={activePreset === preset.id ? 'default' : 'outline'} className="min-w-0 flex-1 justify-start" title={preset.name} onClick={() => updateTheme(preset.theme)} aria-pressed={activePreset === preset.id}><span className="truncate">{preset.name}</span></Button>
              <Button variant="ghost" size="icon" disabled={saving} aria-label={t('custom.delete', { name: preset.name })} title={t('custom.delete', { name: preset.name })} onClick={() => setPendingDelete(preset)}><Trash2 className="h-4 w-4" /></Button>
            </div>
          ))}
          {loading && <p className="text-xs text-muted-foreground">{t('custom.loading')}</p>}
          {loadError && <div role="alert" className="text-sm text-destructive">{t('custom.loadFailed')} <Button variant="link" onClick={() => void load()}>{t('custom.retry')}</Button></div>}
          {addingPreset ? <form className="space-y-2 rounded-lg border bg-muted/30 p-3" onSubmit={(event) => { event.preventDefault(); void savePreset(); }}>
            <label className="block space-y-2 text-sm"><span>{t('custom.name')}</span><Input autoFocus maxLength={40} value={presetName} onChange={(event) => setPresetName(event.target.value)} placeholder={t('custom.placeholder')} aria-invalid={duplicateName} disabled={saving} /></label>
            {duplicateName && <p role="alert" className="text-xs text-destructive">{t('custom.duplicate')}</p>}
            <p className="text-xs leading-5 text-muted-foreground">{t('custom.hint')}</p>
            <div className="flex justify-end gap-2"><Button type="button" variant="ghost" disabled={saving} onClick={() => { setAddingPreset(false); setPresetName(''); }}>{tc('cancel')}</Button><Button type="submit" disabled={saving || !loaded || !presetName.trim() || duplicateName}>{saving ? t('custom.saving') : tc('save')}</Button></div>
          </form> : <Button variant="outline" className="w-full border-dashed" disabled={!loaded || saving} onClick={() => setAddingPreset(true)}><Plus className="h-4 w-4" />{t('custom.add')}</Button>}
        </div>,
      )}
      <AlertDialog open={!!pendingDelete} onOpenChange={(open) => { if (!open) setPendingDelete(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader><AlertDialogTitle>{t('custom.delete', { name: pendingDelete?.name || '' })}</AlertDialogTitle><AlertDialogDescription>{t('custom.deleteHint')}</AlertDialogDescription></AlertDialogHeader>
          <AlertDialogFooter><AlertDialogCancel>{tc('cancel')}</AlertDialogCancel><AlertDialogAction onClick={() => { if (pendingDelete) void remove(pendingDelete.id).catch(() => toast.error(t('custom.deleteFailed'))); }}>{tc('delete')}</AlertDialogAction></AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      {control(
        `${t('fontFamily')} · ${t(`cjkFont.${theme.fontScheme}`)} + ${t(`latinFont.${theme.latinFont}`)}`,
        <div className="space-y-2">
          <label className="block text-xs text-muted-foreground">
            {t('cjkFont.label')}
            <Select
              value={theme.fontScheme}
              // 换中文字体时把西文字体换成它的默认搭配；用户随后仍可单独改
              onValueChange={(value) =>
                updateTheme({ fontScheme: value as FontSchemeId, latinFont: DEFAULT_LATIN_FOR[value as FontSchemeId] })
              }
            >
              <SelectTrigger className="mt-1">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {(Object.keys(CJK_FONTS) as FontSchemeId[]).map((id) => (
                  <SelectItem key={id} value={id}>
                    <span style={{ fontFamily: CJK_FONTS[id].screen }}>{t(`cjkFont.${id}`)}</span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </label>
          <label className="block text-xs text-muted-foreground">
            {t('latinFont.label')}
            <Select value={theme.latinFont} onValueChange={(value) => updateTheme({ latinFont: value as LatinFontId })}>
              <SelectTrigger className="mt-1">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {(Object.keys(LATIN_FONTS) as LatinFontId[]).map((id) => (
                  <SelectItem key={id} value={id}>
                    <span style={{ fontFamily: LATIN_FONTS[id].screen }}>{t(`latinFont.${id}`)}</span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </label>
          <p className="text-[11px] leading-snug text-muted-foreground">{t('fontHint')}</p>
        </div>,
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
                className="mt-1 h-9 px-1 text-center text-sm"
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
        size="sm"
        onClick={() => updateTheme(DEFAULT_THEME)}
        title={t('reset')}
        aria-label={t('reset')}
        className="cursor-pointer"
      >
        <RotateCcw className="h-3.5 w-3.5" />{t('reset')}
      </Button>
      </div>
    </div>
  );
}
