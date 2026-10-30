'use client';

import { useSettingsStore } from '@/stores/settings-store';

import { useState } from 'react';
import { useTranslations, useLocale } from 'next-intl';
import { useRouter } from '@/i18n/routing';
import { Loader2, CheckCircle2, AlertTriangle, Sparkles } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { LanguageSelect } from '@/components/ui/language-select';
import { useUIStore } from '@/stores/ui-store';
import { generateResume } from '@/lib/ai/client-ai-service';

interface GenerateResumeDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated?: () => void;
}

type GenerateState = 'form' | 'generating' | 'success' | 'error';

export function GenerateResumeDialog({ open, onOpenChange, onCreated }: GenerateResumeDialogProps) {
  const t = useTranslations('generateResume');
  const aiConfigured = useSettingsStore(s => Boolean(s.aiApiKey.trim() && s.aiBaseURL.trim()));
  const locale = useLocale();
  const router = useRouter();

  const [brief, setBrief] = useState('');
  const [jobTitle, setJobTitle] = useState('');
  const [yearsOfExperience, setYearsOfExperience] = useState<number | ''>('');
  const [skills, setSkills] = useState('');
  const [industry, setIndustry] = useState('');
  const [experience, setExperience] = useState('');
  const [language, setLanguage] = useState(locale);
  const [state, setState] = useState<GenerateState>('form');
  const [error, setError] = useState('');
  const [result, setResult] = useState<{ resumeId: string } | null>(null);

  const handleGenerate = async () => {
    if (!brief.trim() && !jobTitle.trim()) return;
    if (!aiConfigured) { useUIStore.getState().setSettingsTab('ai'); useUIStore.getState().openModal('settings'); return; }
    setState('generating');
    setError('');

    try {
      const skillsList = skills.trim()
        ? skills.split(/[\s,，、]+/).map(s => s.trim()).filter(Boolean)
        : [];
      const parts: string[] = [];
      if (brief.trim()) parts.push(`用户提供的真实背景与目标：\n${brief.trim()}\n请只依据已提供的信息整理。未知姓名、公司、日期、成绩等保持空白，不编造经历或量化成果。`);
      if (jobTitle.trim()) parts.push(`Job title: ${jobTitle.trim()}`);
      if (yearsOfExperience !== '') parts.push(`Years of experience: ${yearsOfExperience}`);
      if (industry.trim()) parts.push(`Industry: ${industry.trim()}`);
      if (skillsList.length) parts.push(`Skills: ${skillsList.join(', ')}`);
      if (experience.trim()) parts.push(`Experience / background:\n${experience.trim()}`);
      const description = parts.join('\n');

      const data = await generateResume({ description, language });
      setResult(data);
      setState('success');
      onCreated?.();
    } catch (err: any) {
      setError(err.message || 'Failed to generate resume');
      setState('error');
    }
  };

  const handleOpenResume = () => {
    if (result) {
      onOpenChange(false);
      router.push(`/editor/${result.resumeId}`);
    }
  };

  const handleRetry = () => {
    setState('form');
    setError('');
  };

  const handleClose = () => {
    onOpenChange(false);
    setTimeout(() => {
      setState('form');
      setBrief('');
      setJobTitle('');
      setYearsOfExperience('');
      setSkills('');
      setIndustry('');
      setExperience('');
      setLanguage(locale);
      setError('');
      setResult(null);
    }, 200);
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) handleClose(); }}>
      <DialogContent className="sm:max-w-2xl p-0 gap-0 overflow-hidden">
        <DialogHeader className="px-6 pt-6 pb-0">
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-brand" />
            {t('title')}
          </DialogTitle>
          <DialogDescription>{t('description')}</DialogDescription>
        </DialogHeader>

        <div className="max-h-[70vh] overflow-y-auto px-6 py-4 space-y-4">
          {state === 'form' && (
            <>
              <label className="block space-y-2 text-sm font-medium">先说说你做过什么，想找什么工作
                <Textarea aria-label="用一段话描述经历" value={brief} onChange={e => setBrief(e.target.value)} rows={7} placeholder="例如：我是应届生，做过一个校园二手交易项目，负责 React 前端和登录功能，想找前端开发实习。也可以直接粘贴散乱的项目笔记或旧简历文字。" className="text-sm leading-7" />
              </label>
              <p className="text-xs leading-6 text-muted-foreground">不必先整理成标准简历。AI 会把已有素材编排成草稿，缺少的事实留待你补充。</p>
              <details className="rounded-xl border p-3"><summary className="cursor-pointer text-sm">补充明确要求（可选）</summary><div className="mt-4 space-y-4">
              {/* Row 1: Job Title + Years + Industry */}
              <div className="grid grid-cols-3 gap-3">
                <div className="space-y-1.5">
                  <label className="text-sm font-medium text-[var(--app-text-secondary)]">
                    {t('jobTitle')}
                  </label>
                  <Input
                    value={jobTitle}
                    onChange={(e) => setJobTitle(e.target.value)}
                    placeholder={t('jobTitle')}
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-sm font-medium text-[var(--app-text-secondary)]">
                    {t('yearsOfExperience')}
                  </label>
                  <Input
                    type="number"
                    min={0}
                    max={50}
                    value={yearsOfExperience}
                    onChange={(e) => setYearsOfExperience(e.target.value ? Number(e.target.value) : '')}
                    placeholder="3"
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-sm font-medium text-[var(--app-text-secondary)]">
                    {t('industry')}
                  </label>
                  <Input
                    value={industry}
                    onChange={(e) => setIndustry(e.target.value)}
                    placeholder={t('industry')}
                  />
                </div>
              </div>

              {/* Skills */}
              <div className="space-y-1.5">
                <label className="text-sm font-medium text-[var(--app-text-secondary)]">
                  {t('skills')}
                </label>
                <Input
                  value={skills}
                  onChange={(e) => setSkills(e.target.value)}
                  placeholder={t('skillsPlaceholder')}
                />
              </div>

              {/* Work Experience */}
              <div className="space-y-1.5">
                <label className="text-sm font-medium text-[var(--app-text-secondary)]">
                  {t('experience')}
                </label>
                <Textarea
                  value={experience}
                  onChange={(e) => setExperience(e.target.value)}
                  placeholder={t('experiencePlaceholder')}
                  rows={4}
                  className="resize-none"
                />
              </div>

              </div></details>
              <div className="space-y-1.5">
                <label className="text-sm font-medium text-[var(--app-text-secondary)]">
                  {t('language')}
                </label>
                <LanguageSelect value={language} onValueChange={setLanguage} />
              </div>
            </>
          )}

          {state === 'generating' && (
            <div className="flex flex-col items-center justify-center py-8 text-center">
              <Loader2 className="h-8 w-8 animate-spin text-brand mb-3" />
              <p className="text-sm font-medium text-[var(--app-text-secondary)]">
                {t('generating')}
              </p>
            </div>
          )}

          {state === 'success' && (
            <div className="flex flex-col items-center justify-center py-8 text-center">
              <CheckCircle2 className="h-8 w-8 text-[var(--app-text-secondary)] mb-3" />
              <p className="text-sm font-medium text-[var(--app-text-secondary)]">
                {t('success')}
              </p>
              <p className="text-xs text-muted-foreground mt-1">
                {t('successDescription')}
              </p>
            </div>
          )}

          {state === 'error' && (
            <div className="flex flex-col items-center justify-center py-6 text-center">
              <AlertTriangle className="h-8 w-8 text-red-500 mb-3" />
              <p className="text-sm font-medium text-red-600">
                {error || t('error')}
              </p>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex justify-end gap-2 px-6 pb-5 pt-3">
          {state === 'form' && (
            <>
              <Button
                variant="outline"
                onClick={handleClose}
                className="cursor-pointer"
              >
                {t('close')}
              </Button>
              <Button
                onClick={handleGenerate}
                disabled={!brief.trim() && !jobTitle.trim()}
                variant="primary" className="cursor-pointer"
              >
                {aiConfigured ? t('generate') : '配置 AI 后生成'}
              </Button>
            </>
          )}
          {state === 'success' && (
            <>
              <Button
                variant="outline"
                onClick={handleClose}
                className="cursor-pointer"
              >
                {t('close')}
              </Button>
              <Button
                onClick={handleOpenResume}
                variant="primary" className="cursor-pointer"
              >
                {t('openResume')}
              </Button>
            </>
          )}
          {state === 'error' && (
            <>
              <Button
                variant="outline"
                onClick={handleClose}
                className="cursor-pointer"
              >
                {t('close')}
              </Button>
              <Button
                onClick={handleRetry}
                variant="primary" className="cursor-pointer"
              >
                {aiConfigured ? t('generate') : '配置 AI 后生成'}
              </Button>
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
