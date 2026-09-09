import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { EXPORT_TAILWIND_CSS } from '@/lib/pdf/export-tailwind-css';
import { generateQrSvg } from '@/lib/qrcode';
import { resolveTheme } from '@/lib/theme-config';
import { ResumePreview } from '@/components/preview/resume-preview';
import type { QrCodeItem, Resume, ResumeSection } from '@/types/resume';

function esc(text: unknown): string {
  if (text == null) return '';
  return String(text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function isValidQrUrl(str: string): boolean {
  if (!str?.trim()) return false;
  try {
    const url = new URL(str.startsWith('http') ? str : `https://${str}`);
    return (
      ['http:', 'https:'].includes(url.protocol) &&
      (url.hostname === 'localhost' ||
        /\.\w{2,}$/.test(url.hostname) ||
        /^\d{1,3}(\.\d{1,3}){3}$/.test(url.hostname))
    );
  } catch {
    return false;
  }
}

/** 二维码 SVG 在服务端渲染前预生成，挂在 section.content._qrSvgs 上供模板读取。 */
async function preGenerateQrSvgs(sections: ResumeSection[]): Promise<void> {
  const section = sections.find((s) => s.type === 'qr_codes');
  if (!section || section.visible === false) return;
  const content = section.content as { items?: QrCodeItem[]; _qrSvgs?: Record<string, string> };
  const svgs: Record<string, string> = {};
  for (const qr of (content.items || []).filter((q) => isValidQrUrl(q.url))) {
    try {
      svgs[qr.id] = await generateQrSvg(qr.url, 80);
    } catch {
      /* 无效二维码不阻断导出 */
    }
  }
  content._qrSvgs = svgs;
}

// A4 与零页边距：页边距由主题 CSS 画在纸内，纸张尺寸不声明时 Chrome 会按 Letter 打印。
const PDF_PAGE_CSS =
  '@page { size: A4; margin: 0; } html,body { background:white!important; padding:0!important; ' +
  'margin:0!important; display:block!important; } .resume-export { width:100%; } ' +
  '[data-section] { break-inside:auto!important; overflow:visible!important; } ' +
  '[data-section] .item { break-inside:avoid!important; } h2,h3 { break-after:avoid!important; } ' +
  'p { orphans:3; widows:3; }';

export async function generateHtml(resume: Resume, forPdf = false): Promise<string> {
  const exportResume: Resume = {
    ...resume,
    sections: (resume.sections || []).map((s) => ({ ...s, content: { ...s.content } })),
  };
  await preGenerateQrSvgs(exportResume.sections);
  const theme = resolveTheme(exportResume.themeConfig);
  // 主题 CSS（含导出字体栈、页边距）由 ResumePreview 在 exportMode 下自行输出，这里不再重复一份。
  const bodyHtml = renderToStaticMarkup(
    createElement(ResumePreview, { resume: exportResume, interactive: false, exportMode: true }),
  );
  const language = esc(exportResume.language || 'zh');
  const title = esc(exportResume.title);
  const avatarStyle = esc(theme.avatarStyle);
  return (
    `<!DOCTYPE html><html lang="${language}"><head><meta charset="UTF-8">` +
    `<meta name="viewport" content="width=device-width, initial-scale=1.0">` +
    `<title>${title}</title><style>${EXPORT_TAILWIND_CSS}</style><style>` +
    `body { margin:0; display:flex; justify-content:center; padding:40px 20px; ` +
    `background:#f4f4f5; min-height:100vh; }\n` +
    `@media print { body { padding:0!important; background:white!important; } }\n` +
    `.resume-export { width:210mm; max-width:100%; }\n` +
    `${forPdf ? PDF_PAGE_CSS : ''}\n` +
    `.resume-export .rounded-full { border-radius:9999px!important; }\n` +
    `.resume-export[data-avatar-style="oneInch"] img[class*="object-cover"] { ` +
    `border-radius:4px!important; aspect-ratio:5/7!important; height:auto!important; }\n` +
    `.resume-export[data-avatar-style="circle"] img[class*="object-cover"] { ` +
    `border-radius:9999px!important; aspect-ratio:1/1!important; }\n` +
    `</style></head><body><div class="resume-export" ` +
    `data-avatar-style="${avatarStyle}">${bodyHtml}</div></body></html>`
  );
}
