import { Bold, Italic, Underline } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface InlineFormatButtonsProps {
  onFormat: (marker: string) => void;
}

export function InlineFormatButtons({ onFormat }: InlineFormatButtonsProps) {
  return (
    <div className="flex items-center gap-0.5">
      <Button type="button" variant="ghost" size="icon-xs" onClick={() => onFormat('**')} aria-label="粗体"><Bold className="h-3.5 w-3.5" /></Button>
      <Button type="button" variant="ghost" size="icon-xs" onClick={() => onFormat('*')} aria-label="斜体"><Italic className="h-3.5 w-3.5" /></Button>
      <Button type="button" variant="ghost" size="icon-xs" onClick={() => onFormat('__')} aria-label="下划线"><Underline className="h-3.5 w-3.5" /></Button>
    </div>
  );
}

export function formatSelection(input: HTMLInputElement | HTMLTextAreaElement, marker: string, onChange: (value: string) => void) {
  const start = input.selectionStart ?? input.value.length;
  const end = input.selectionEnd ?? start;
  const next = `${input.value.slice(0, start)}${marker}${input.value.slice(start, end)}${marker}${input.value.slice(end)}`;
  onChange(next);
  requestAnimationFrame(() => {
    input.focus();
    input.setSelectionRange(start + marker.length, end + marker.length);
  });
}
