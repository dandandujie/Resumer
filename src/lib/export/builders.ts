import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { esc, buildExportThemeCSS, type ResumeWithSections } from './utils';
import { resolveTheme } from '@/lib/theme-config';
import { EXPORT_TAILWIND_CSS } from '@/lib/pdf/export-tailwind-css';
import { generateQrSvg } from '@/lib/qrcode';
import { ResumePreview } from '@/components/preview/resume-preview';

function isValidQrUrl(str: string): boolean {
  if (!str?.trim()) return false;
  try {
    const url = new URL(str.startsWith('http') ? str : `https://${str}`);
    return ['http:', 'https:'].includes(url.protocol) && (url.hostname === 'localhost' || /\.\w{2,}$/.test(url.hostname) || /^\d{1,3}(\.\d{1,3}){3}$/.test(url.hostname));
  } catch { return false; }
}

async function preGenerateQrSvgs(resume: ResumeWithSections): Promise<void> {
  const section = resume.sections.find((s: any) => s.type === 'qr_codes');
  if (!section || section.visible === false) return;
  const items = ((section.content as any).items || []).filter((q: any) => isValidQrUrl(q.url));
  const svgs: Record<string, string> = {};
  for (const qr of items) {
    try { svgs[qr.id] = await generateQrSvg(qr.url, 80); } catch { /* 无效二维码不阻断导出 */ }
  }
  (section.content as any)._qrSvgs = svgs;
}

export async function generateHtml(resume: ResumeWithSections, forPdf = false): Promise<string> {
  const exportResume = { ...resume, sections: resume.sections.map((s) => ({ ...s, content: { ...(s.content as any) } })) };
  await preGenerateQrSvgs(exportResume);
  const theme = resolveTheme(exportResume.themeConfig);
  const bodyHtml = renderToStaticMarkup(createElement(ResumePreview, { resume: exportResume, interactive: false, exportMode: true }));
  const themeCSS = buildExportThemeCSS(theme);
  const pdfOverrides = forPdf ? `@page { margin: 0; } html,body { background:white!important; padding:0!important; margin:0!important; display:block!important; } .resume-export { width:100%; } .resume-export > div { box-shadow:none!important; overflow:visible!important; } [data-section] { break-inside:auto!important; overflow:visible!important; } [data-section] .item { break-inside:avoid!important; } h2,h3 { break-after:avoid!important; } p { orphans:3; widows:3; }` : '';
  return `<!DOCTYPE html><html lang="${esc(exportResume.language || 'en')}"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><title>${esc(exportResume.title)}</title><style>${EXPORT_TAILWIND_CSS}</style><style>
    body { margin:0; display:flex; justify-content:center; padding:40px 20px; background:#f4f4f5; min-height:100vh; }
    @media print { body { padding:0!important; background:white!important; } }
    ${themeCSS}${pdfOverrides}
    .resume-export .rounded-full { border-radius:9999px!important; }
    .resume-export[data-avatar-style="oneInch"] img[class*="object-cover"] { border-radius:4px!important; aspect-ratio:5/7!important; height:auto!important; }
    .resume-export[data-avatar-style="circle"] img[class*="object-cover"] { border-radius:9999px!important; aspect-ratio:1/1!important; }
  </style></head><body><div class="resume-export" data-avatar-style="${esc(theme.avatarStyle)}">${bodyHtml}</div></body></html>`;
}
