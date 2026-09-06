export function md(text: unknown): string {
  if (text == null) return '';
  let value = String(text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
  value = value
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/__(.+?)__/g, '<u>$1</u>')
    .replace(/\*([^*]+?)\*/g, '<em>$1</em>')
    .replace(/`([^`]+)`/g, '<code>$1</code>');
  if (!value.includes('\n')) return value;

  const lines = value.split('\n');
  let html = '';
  let inList = false;
  for (const raw of lines) {
    const line = raw.trim();
    if (!line) {
      if (inList) { html += '</ul>'; inList = false; }
      continue;
    }
    const list = line.match(/^[-–•]\s+(.*)/);
    if (list) {
      if (!inList) { html += '<ul style="margin:2px 0;padding-left:1.5em;list-style-type:disc">'; inList = true; }
      html += `<li>${list[1]}</li>`;
    } else {
      if (inList) { html += '</ul>'; inList = false; }
      html += (html && !html.endsWith('>') ? '<br>' : '') + line;
    }
  }
  if (inList) html += '</ul>';
  return html;
}
