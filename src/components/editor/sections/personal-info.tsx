'use client';

import { useRef } from 'react';
import { useTranslations } from 'next-intl';
import { Camera, ChevronDown, X, Circle, RectangleVertical } from 'lucide-react';
import { EditableText } from '../fields/editable-text';
import { EditableSelect } from '../fields/editable-select';
import { FieldWrapper } from '../fields/field-wrapper';
import { useResumeStore } from '@/stores/resume-store';
import type { ResumeSection, PersonalInfoContent } from '@/types/resume';

interface Props {
  section: ResumeSection;
  onUpdate: (content: Partial<PersonalInfoContent>) => void;
}

function resizeImage(file: File, maxSize: number): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        let { width, height } = img;
        if (width > height) {
          if (width > maxSize) {
            height = Math.round((height * maxSize) / width);
            width = maxSize;
          }
        } else {
          if (height > maxSize) {
            width = Math.round((width * maxSize) / height);
            height = maxSize;
          }
        }
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d')!;
        ctx.drawImage(img, 0, 0, width, height);
        resolve(canvas.toDataURL('image/jpeg', 0.85));
      };
      img.onerror = reject;
      img.src = e.target?.result as string;
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

export function PersonalInfoSection({ section, onUpdate }: Props) {
  const t = useTranslations('editor.fields');
  const tTheme = useTranslations('themeEditor');
  const content = section.content as PersonalInfoContent;
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { currentResume } = useResumeStore();
  const avatarStyle = currentResume?.themeConfig?.avatarStyle || 'oneInch';

  const updateAvatarStyle = (style: 'circle' | 'oneInch') => {
    if (!currentResume) return;
    const newConfig = { ...currentResume.themeConfig, avatarStyle: style };
    useResumeStore.setState((state) => ({
      currentResume: state.currentResume
        ? { ...state.currentResume, themeConfig: newConfig }
        : null,
      isDirty: true,
    }));
    useResumeStore.getState()._scheduleSave();
  };

  const handleAvatarChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const dataUrl = await resizeImage(file, 200);
    onUpdate({ avatar: dataUrl });
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  return (
    <div className="space-y-3">
      {/* Avatar upload + style toggle */}
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          className="relative flex h-20 w-20 shrink-0 items-center justify-center overflow-hidden rounded-full border-2 border-dashed border-[var(--app-border)] bg-muted transition-colors hover:border-[var(--app-text)]/30 hover:bg-[var(--app-hover)]"
        >
          {content.avatar ? (
            <img src={content.avatar} alt="Avatar" className="h-full w-full object-cover" />
          ) : (
            <Camera className="h-6 w-6 text-[var(--app-text-muted)]" />
          )}
        </button>
        <div className="flex flex-col gap-2">
          {/* Segmented shape toggle */}
          <div className="inline-flex rounded-lg bg-[var(--app-hover)] p-0.5">
            {([
              { value: 'circle' as const, icon: Circle, label: tTheme('avatarCircle') },
              { value: 'oneInch' as const, icon: RectangleVertical, label: tTheme('avatarOneInch') },
            ]).map(({ value, icon: Icon, label }) => (
              <button
                key={value}
                type="button"
                onClick={() => updateAvatarStyle(value)}
                className={`inline-flex cursor-pointer items-center gap-1.5 rounded-md px-2.5 py-1 text-xs transition-all duration-200 ${
                  avatarStyle === value
                    ? 'bg-card font-medium text-[var(--app-text)] shadow-sm'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                <Icon className="h-3 w-3" />
                {label}
              </button>
            ))}
          </div>
          {/* Remove avatar */}
          {content.avatar && (
            <button
              type="button"
              onClick={() => onUpdate({ avatar: '' })}
              className="inline-flex w-fit cursor-pointer items-center gap-1 rounded-md px-2 py-0.5 text-[11px] text-[var(--app-text-muted)] transition-colors hover:bg-[var(--app-hover)] hover:text-[var(--app-text)]"
            >
              <X className="h-3 w-3" />
              {t('clear')}
            </button>
          )}
        </div>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          onChange={handleAvatarChange}
          className="hidden"
        />
      </div>

      <FieldGroup title={t('groupBasic')} defaultOpen>
        <FieldWrapper>
          <EditableText field="fullName" label={t('fullName')} value={content.fullName} onChange={(v) => onUpdate({ fullName: v })} />
          <EditableText field="jobTitle" label={t('jobTitle')} value={content.jobTitle} onChange={(v) => onUpdate({ jobTitle: v })} />
        </FieldWrapper>
        <FieldWrapper>
          <EditableText field="yearsOfExperience" label={t('yearsOfExperience')} value={content.yearsOfExperience || ''} onChange={(v) => onUpdate({ yearsOfExperience: v })} />
          <EditableSelect field="educationLevel"
            label={t('educationLevel')}
            value={content.educationLevel || ''}
            onChange={(v) => onUpdate({ educationLevel: v })}
            options={t('educationLevelOptions').split(',').map((s) => ({ label: s, value: s }))}
          />
        </FieldWrapper>
      </FieldGroup>
      <FieldGroup title={t('groupContact')} defaultOpen>
        <FieldWrapper>
          <EditableText field="email" label={t('email')} value={content.email} onChange={(v) => onUpdate({ email: v })} type="email" />
          <EditableText field="phone" label={t('phone')} value={content.phone} onChange={(v) => onUpdate({ phone: v })} type="tel" />
        </FieldWrapper>
        <FieldWrapper>
          <EditableText field="wechat" label={t('wechat')} value={content.wechat || ''} onChange={(v) => onUpdate({ wechat: v })} />
          <EditableText field="location" label={t('location')} value={content.location} onChange={(v) => onUpdate({ location: v })} />
        </FieldWrapper>
        <FieldWrapper>
          <EditableText field="website" label={t('website')} value={content.website || ''} onChange={(v) => onUpdate({ website: v })} />
        </FieldWrapper>
      </FieldGroup>
      <FieldGroup title={t('customLinks')} defaultOpen={Boolean(content.github || content.linkedin || content.customLinks?.length)}>
        <EditableText field="github" label={t('githubProfile')} value={content.github || ''} onChange={github => onUpdate({ github })} />
        <EditableText field="linkedin" label={t('linkedin')} value={content.linkedin || ''} onChange={linkedin => onUpdate({ linkedin })} />
        {content.customLinks?.map((link, index) => <div key={index} className="space-y-2 border-t border-[var(--app-border)] pt-2">
          <EditableText field={`customLinks.${index}.label`} label={t('linkLabel')} value={link.label} onChange={label => onUpdate({ customLinks: content.customLinks?.map((item,i) => i===index ? {...item,label} : item) })} />
          <EditableText field={`customLinks.${index}.url`} label={t('linkUrl')} value={link.url} onChange={url => onUpdate({ customLinks: content.customLinks?.map((item,i) => i===index ? {...item,url} : item) })} />
          <button type="button" className="text-xs text-[var(--app-text-muted)]" onClick={() => onUpdate({ customLinks: content.customLinks?.filter((_,i)=>i!==index) })}>{t('removeLink')}</button>
        </div>)}
        <button type="button" className="text-xs text-[var(--app-text-muted)]" onClick={() => onUpdate({ customLinks: [...(content.customLinks || []), { label:'', url:'' }] })}>{t('addLink')}</button>
      </FieldGroup>
      {/* 社招简历通常不填这些；已有值时默认展开，避免用户找不到自己填过的内容 */}
      <FieldGroup
        title={t('groupExtra')}
        defaultOpen={Boolean(
          content.age || content.gender || content.politicalStatus || content.ethnicity ||
          content.hometown || content.maritalStatus,
        )}
      >
        <FieldWrapper>
          <EditableText field="age" label={t('age')} value={content.age || ''} onChange={(v) => onUpdate({ age: v })} />
          <EditableSelect field="gender"
            label={t('gender')}
            value={content.gender || ''}
            onChange={(v) => onUpdate({ gender: v })}
            options={t('genderOptions').split(',').map((s) => ({ label: s, value: s }))}
          />
        </FieldWrapper>
        <FieldWrapper>
          <EditableSelect field="politicalStatus"
            label={t('politicalStatus')}
            value={content.politicalStatus || ''}
            onChange={(v) => onUpdate({ politicalStatus: v })}
            options={t('politicalStatusOptions').split(',').map((s) => ({ label: s, value: s }))}
          />
          <EditableSelect field="ethnicity"
            label={t('ethnicity')}
            value={content.ethnicity || ''}
            onChange={(v) => onUpdate({ ethnicity: v })}
            options={t('ethnicityOptions').split(',').map((s) => ({ label: s, value: s }))}
          />
        </FieldWrapper>
        <FieldWrapper>
          <EditableText field="hometown" label={t('hometown')} value={content.hometown || ''} onChange={(v) => onUpdate({ hometown: v })} />
          <EditableSelect field="maritalStatus"
            label={t('maritalStatus')}
            value={content.maritalStatus || ''}
            onChange={(v) => onUpdate({ maritalStatus: v })}
            options={t('maritalStatusOptions').split(',').map((s) => ({ label: s, value: s }))}
          />
        </FieldWrapper>
      </FieldGroup>
    </div>
  );
}

/** 原生 details：键盘可达、无额外依赖；标题栏使用共享分隔线与文字色。 */
function FieldGroup({ title, defaultOpen, children }: { title: string; defaultOpen?: boolean; children: React.ReactNode }) {
  return (
    <details open={defaultOpen} className="group rounded-lg border border-[var(--app-border)] bg-[var(--app-surface)]">
      <summary className="flex cursor-pointer select-none items-center justify-between px-3 py-2 text-xs font-semibold text-[var(--app-text-secondary)]">
        {title}
        <ChevronDown className="h-3.5 w-3.5 transition-transform group-open:rotate-180" />
      </summary>
      <div className="space-y-3 border-t border-[var(--app-border)] p-3">{children}</div>
    </details>
  );
}
