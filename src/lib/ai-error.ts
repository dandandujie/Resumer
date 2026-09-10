/**
 * 把模型服务商返回的原始错误翻译成用户能采取行动的提示。
 * 只做模式匹配，不吞原文：原始错误仍然进错误面板与诊断信息。
 */

export type AiErrorKind =
  | 'auth'
  | 'forbidden'
  | 'model_missing'
  | 'rate_limit'
  | 'quota'
  | 'tools_unsupported'
  | 'context_length'
  | 'network'
  | 'server'
  | 'chrome_missing'
  | 'unknown';

const PATTERNS: { kind: AiErrorKind; test: RegExp }[] = [
  { kind: 'chrome_missing', test: /CHROME_NOT_FOUND/ },
  { kind: 'auth', test: /\b401\b|invalid[_ ]api[_ ]key|incorrect api key|authentication|unauthorized|api key is required/i },
  { kind: 'quota', test: /insufficient[_ ]quota|余额|balance|billing|exceeded your current quota|credit/i },
  { kind: 'rate_limit', test: /\b429\b|rate[_ ]limit|too many requests|overloaded/i },
  { kind: 'forbidden', test: /\b403\b|forbidden|unsupported_country|not available in your region/i },
  { kind: 'model_missing', test: /\b404\b|model[_ ]not[_ ]found|does not exist|no such model|unknown model/i },
  { kind: 'tools_unsupported', test: /tool[_ ]?(call|use|choice)s?.*(not supported|unsupported|invalid)|does not support (tools|function)/i },
  { kind: 'context_length', test: /context[_ ]length|maximum context|too many tokens|token limit|prompt is too long/i },
  { kind: 'network', test: /error sending request|dns|connection (refused|reset)|timed? ?out|ECONN|ENOTFOUND|network|certificate|tls|proxy/i },
  { kind: 'server', test: /\b5\d\d\b|internal server error|bad gateway|service unavailable/i },
];

export function classifyAiError(message: string): AiErrorKind {
  const text = message || '';
  return PATTERNS.find((pattern) => pattern.test.test(text))?.kind ?? 'unknown';
}

export interface AiDiagnostics {
  time: string;
  appVersion: string;
  platform: string;
  provider: string;
  baseUrlHost: string;
  model: string;
  webSearchMode: string;
  error: string;
}

/** 只带主机名，不带 Key、不带完整 URL 里可能出现的路径参数。 */
export function hostOf(url: string): string {
  try {
    return new URL(url).host;
  } catch {
    return url ? '(invalid url)' : '(empty)';
  }
}

export function formatDiagnostics(diagnostics: AiDiagnostics): string {
  return [
    `Resumer ${diagnostics.appVersion} · ${diagnostics.platform}`,
    `time: ${diagnostics.time}`,
    `provider: ${diagnostics.provider}`,
    `baseUrl: ${diagnostics.baseUrlHost}`,
    `model: ${diagnostics.model}`,
    `webSearch: ${diagnostics.webSearchMode}`,
    `error: ${diagnostics.error}`,
  ].join('\n');
}
