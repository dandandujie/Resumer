import { ArrowDown, ArrowUp } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Slider } from '@/components/ui/slider';
import { Input } from '@/components/ui/input';
import { useResumeStore } from '@/stores/resume-store';
import { useEditorStore } from '@/stores/editor-store';
import { resolveTheme } from '@/lib/theme-config';
import type { Resume, ThemeConfig } from '@/types/resume';

/** 示意图只含版式，不包含姓名、联系方式或经历；保存模板也不保存个人内容。 */
export function TemplateMiniature({ template = 'classic', theme: raw }: { template?: string; theme?: ThemeConfig }) {
  const theme = resolveTheme(raw);
  const modern = template === 'modern';
  const lines = (count: number) => Array.from({length: count}, (_, i) => <div key={i} style={{height: 2, width: `${92 - i % 3 * 12}%`, background: 'currentColor', opacity: .2}} />);
  const block = (key: number) => <div key={key} className="space-y-1"><div style={{height: 4, width: '45%', background: theme.primaryColor, borderBottom: `1px solid ${theme.accentColor}`}} />{lines(3)}</div>;
  return <div aria-hidden="true" className="flex h-28 overflow-hidden rounded border border-zinc-200 bg-white text-zinc-900" style={{fontFamily: 'sans-serif'}}>
    {modern && <div className="space-y-2 p-2 text-white" style={{width: `${theme.sidebarWidth}%`, background: theme.sidebarColor, color:theme.sidebarTextColor}}><div className="mx-auto h-3 w-3 rounded bg-white/50" />{lines(5)}</div>}
    <div className="min-w-0 flex-1 space-y-2 p-2">
      {!modern && <div className="space-y-1" style={{textAlign: theme.headerAlign}}><div style={{width: '25%', height: 5, background: theme.primaryColor, margin: theme.headerAlign === 'center' ? 'auto' : 0}} /><div className="mx-auto h-px w-full bg-zinc-200" /></div>}
      {[0, 1, 2].map(block)}
    </div>
  </div>;
}

export function TemplateLayoutControls({ resume, updateTheme, endDrag }: { resume: Resume; updateTheme: (update: Partial<ThemeConfig>, options?: {continuous:boolean}) => void; endDrag: () => void }) {
  const theme = resolveTheme(resume.themeConfig);
  const part = useEditorStore(s => s.templatePart);
  const setPart = (templatePart: typeof part) => useEditorStore.setState({templatePart});
  const mutate = (fn: () => void) => { useEditorStore.getState().pushSnapshot(useResumeStore.getState().sections); fn(); };
  const move = (id: string, offset: number) => mutate(() => {
    const sections = [...useResumeStore.getState().sections];
    const index = sections.findIndex(s => s.id === id);
    const next = index + offset;
    if (index < 0 || next < 0 || next >= sections.length) return;
    [sections[index], sections[next]] = [sections[next], sections[index]];
    useResumeStore.getState().reorderSections(sections.map((s, sortOrder) => ({...s, sortOrder})));
  });
  return <section aria-label="可视化模板设计" className="space-y-4 border-b border-[var(--app-border)] pb-5">
    <div><h3 className="text-sm font-semibold">设计我的模板</h3><p className="mt-1 text-xs leading-5 text-muted-foreground">选版式 → 点选要调整的区域 → 保存为我的模板。预览实时更新；窄窗口可切换“预览”查看。内容保持独立。</p></div>
    <div className="grid grid-cols-2 gap-2">{(['classic','modern'] as const).map(template => <Button key={template} variant={resume.template === template ? 'selected' : 'outline'} className="h-auto min-w-0 flex-col items-stretch p-2" aria-pressed={resume.template === template} onClick={() => mutate(() => useResumeStore.getState().setTemplate(template))}>
      <TemplateMiniature template={template} theme={theme} /><span className="mt-1 text-xs">{template === 'classic' ? '单栏 · 清晰直读' : '双栏 · 侧栏摘要'}</span>
    </Button>)}</div>
    <div className="flex flex-wrap gap-1" role="group" aria-label="调整区域">{([['all','整体'],['header','页眉与照片'],['headings','板块标题'],['body','正文'],['sections','模块顺序']] as const).map(([value, label]) => <Button key={value} size="sm" variant={part === value ? 'selected' : 'outline'} aria-pressed={part === value} onClick={() => setPart(value)}>{label}</Button>)}</div>
    <div className="space-y-3 rounded-lg border border-[var(--app-border)] bg-[var(--app-field)] p-3">
      {part === 'all' && <>
        <p className="text-xs text-muted-foreground">先选舒适的密度，也可以在预览中点选姓名、标题或正文继续调整。</p>
        <div className="grid grid-cols-3 gap-1">{[{name:'紧凑',fontSize:13,lineSpacing:1.2,sectionSpacing:5},{name:'适中',fontSize:14,lineSpacing:1.35,sectionSpacing:6},{name:'舒展',fontSize:15,lineSpacing:1.5,sectionSpacing:12}].map(({name,...value}) => <Button key={name} size="sm" variant="outline" onClick={() => updateTheme(value)}>{name}</Button>)}</div>
        {resume.template === 'modern' && <><label className="block text-xs">侧栏宽度 · {theme.sidebarWidth}%<Slider className="mt-3" min={25} max={45} step={1} value={[theme.sidebarWidth]} onValueChange={([value]) => updateTheme({sidebarWidth:value}, {continuous:true})} onValueCommit={endDrag} aria-label="侧栏宽度" /></label><label className="flex items-center justify-between text-xs">侧栏颜色<Input type="color" className="h-8 w-16 p-1" value={theme.sidebarColor} onChange={e => updateTheme({sidebarColor:e.target.value}, {continuous:true})} onBlur={endDrag} /></label></>}
      </>}
      {part === 'header' && <><p className="text-xs font-medium">姓名与联系方式</p><div className="flex gap-2">{(['center','left'] as const).map(value => <Button key={value} variant={theme.headerAlign === value ? 'selected' : 'outline'} size="sm" aria-pressed={theme.headerAlign === value} onClick={() => updateTheme({headerAlign:value})}>{value === 'center' ? '居中' : '左对齐'}</Button>)}</div><p className="text-xs font-medium">照片位置{resume.template === 'modern' && '（双栏在侧栏显示）'}</p><div className="flex flex-wrap gap-1">{(['left','right','hidden'] as const).filter(value => resume.template !== 'modern' || value !== 'right').map(value => <Button key={value} size="sm" variant={theme.photoPosition === value ? 'selected' : 'outline'} aria-pressed={theme.photoPosition === value} onClick={() => updateTheme({photoPosition:value})}>{({left:'显示在左侧',right:'显示在右侧',hidden:'隐藏照片'})[value]}</Button>)}</div></>}
      {part === 'headings' && <><div className="grid grid-cols-3 gap-1">{(['underline','plain','filled'] as const).map(value => <Button key={value} size="sm" variant={theme.headingStyle === value ? 'selected' : 'outline'} aria-pressed={theme.headingStyle === value} onClick={() => updateTheme({headingStyle:value})}>{({underline:'下划线',plain:'纯文字',filled:'色块'})[value]}</Button>)}</div><label className="flex items-center justify-between text-xs">标题与分隔线颜色<Input type="color" className="h-8 w-16 p-1" value={theme.primaryColor} onChange={e => updateTheme({primaryColor:e.target.value,accentColor:e.target.value}, {continuous:true})} onBlur={endDrag} /></label></>}
      {part === 'body' && <><div className="flex flex-wrap gap-1">{([['sourcehan-sans','calibri','清晰无衬线'],['sourcehan-serif','times','正式宋体']] as const).map(([fontScheme,latinFont,label]) => <Button key={fontScheme} size="sm" variant={theme.fontScheme === fontScheme ? 'selected' : 'outline'} onClick={() => updateTheme({fontScheme,latinFont})}>{label}</Button>)}</div><label className="block text-xs">正文字号 · {theme.fontSize}px<Slider className="mt-3" min={10} max={20} step={.5} value={[theme.fontSize]} onValueChange={([value]) => updateTheme({fontSize:value}, {continuous:true})} onValueCommit={endDrag} aria-label="快速正文字号" /></label></>}
      {part === 'sections' && <><p className="text-xs text-muted-foreground">用上下箭头调整阅读顺序。双栏可选择模块所在栏；同类型模块共用栏目设置。</p>{resume.sections.filter(s => s.type !== 'personal_info').map(section => {const index = resume.sections.findIndex(s => s.id === section.id);return <div key={section.id} className="flex items-center gap-1 text-xs"><span className="min-w-0 flex-1 truncate" title={section.title}>{section.title}</span>{resume.template === 'modern' && <Button size="sm" variant="outline" onClick={() => updateTheme({sidebarTypes: theme.sidebarTypes.includes(section.type) ? theme.sidebarTypes.filter(t => t !== section.type) : [...theme.sidebarTypes,section.type]})}>{theme.sidebarTypes.includes(section.type) ? '侧栏' : '主栏'}</Button>}<Button size="icon-xs" variant="ghost" disabled={index <= 1} aria-label={`上移${section.title}`} onClick={() => move(section.id,-1)}><ArrowUp className="h-3 w-3" /></Button><Button size="icon-xs" variant="ghost" disabled={index === resume.sections.length - 1} aria-label={`下移${section.title}`} onClick={() => move(section.id,1)}><ArrowDown className="h-3 w-3" /></Button></div>})}</>}
    </div>
  </section>;
}
