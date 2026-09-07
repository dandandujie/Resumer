'use client';

import { useMemo, useState } from 'react';
import { useTranslations } from 'next-intl';
import { CalendarDays, ChevronLeft, ChevronRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { normalizeMonth } from '@/lib/resume-date';

interface EditableDateProps {
  label: string;
  value: string;
  onChange: (value: string) => void;
  current?: boolean;
  allowCurrent?: boolean;
  onCurrentChange?: (current: boolean) => void;
}
const MONTHS = [
  '01',
  '02',
  '03',
  '04',
  '05',
  '06',
  '07',
  '08',
  '09',
  '10',
  '11',
  '12',
] as const;

export function EditableDate({
  label,
  value,
  onChange,
  current = false,
  allowCurrent = false,
  onCurrentChange,
}: EditableDateProps) {
  const t = useTranslations('editor.fields');
  const [open, setOpen] = useState(false);
  const normalized = useMemo(() => normalizeMonth(value), [value]);
  const [year = '', month = ''] = normalized.split('-');
  const [browseYear, setBrowseYear] = useState(
    () => Number(year) || new Date().getFullYear(),
  );
  // 识别不了的写法（如 `2023`、`Summer 2022`）原样保留，绝不清空用户输入。
  const commit = (next: string) => onChange(normalizeMonth(next) || next.trim());

  return (
    <div className="space-y-1">
      <label className="text-xs font-medium text-[var(--whale-ink-muted)]">
        {label}
      </label>
      <div className="flex gap-1">
        <Input
          disabled={current}
          value={current ? '' : value}
          placeholder="YYYY.MM"
          onChange={(e) => onChange(e.target.value)}
          onBlur={(e) => commit(e.target.value)}
          className="h-8 min-w-0 text-sm"
        />
        <Popover
          open={open}
          onOpenChange={(next) => {
            setOpen(next);
            if (next) setBrowseYear(Number(year) || new Date().getFullYear());
          }}
        >
          <PopoverTrigger asChild>
            <Button variant="outline" size="icon" className="h-8 w-8 shrink-0">
              <CalendarDays className="h-3.5 w-3.5" />
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-56 p-3">
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 w-7 p-0"
                  onClick={() => setBrowseYear((v) => v - 1)}
                >
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                <span className="text-sm font-medium">{browseYear}</span>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 w-7 p-0"
                  onClick={() => setBrowseYear((v) => v + 1)}
                >
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
              <div className="grid grid-cols-4 gap-1">
                {MONTHS.map((m) => (
                  <Button
                    key={m}
                    variant="ghost"
                    size="sm"
                    className={
                      year === String(browseYear) && month === m
                        ? 'bg-brand-muted'
                        : ''
                    }
                    onClick={() => {
                      commit(`${browseYear}-${m}`);
                      setOpen(false);
                    }}
                  >
                    {t(`months.${m}` as any)}
                  </Button>
                ))}
              </div>
              {value && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 w-full text-xs"
                  onClick={() => {
                    onChange('');
                    setOpen(false);
                  }}
                >
                  {t('clear')}
                </Button>
              )}
            </div>
          </PopoverContent>
        </Popover>
      </div>
      {allowCurrent && (
        <label className="flex items-center gap-2 text-xs text-[var(--whale-ink-muted)]">
          <Switch checked={current} onCheckedChange={onCurrentChange} />
          {t('current')}
        </label>
      )}
    </div>
  );
}
