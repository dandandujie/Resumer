import { Input } from '@/components/ui/input';
import { useSpeechStore } from '@/stores/speech-store';

export function SpeechSettings() {
  const { config, update } = useSpeechStore();
  return <div className="space-y-5 p-5 sm:p-6" data-speech-settings>
    <header className="space-y-2">
      <p className="text-xs leading-6 text-muted-foreground">导入录音后，点击转写才会发送到你配置的服务。支持 OpenAI 音频转写协议，也可使用本机运行的兼容 Whisper 服务。导入、播放和手动粘贴文字稿无需服务。</p></header>
    <div className="grid gap-4 sm:grid-cols-2">
      <label className="space-y-1.5 text-sm sm:col-span-2">服务地址<Input aria-label="语音服务地址" value={config.baseUrl} onChange={e => update({ baseUrl: e.target.value })} placeholder="https://api.openai.com/v1 或 http://127.0.0.1:8000/v1" /></label>
      <label className="space-y-1.5 text-sm">API Key<Input aria-label="语音服务 API Key" type="password" autoComplete="off" value={config.apiKey} onChange={e => update({ apiKey: e.target.value })} placeholder="本地服务可留空" /></label>
      <label className="space-y-1.5 text-sm">识别模型<Input aria-label="语音识别模型" value={config.model} onChange={e => update({ model: e.target.value })} placeholder="whisper-1" /></label>
      <label className="space-y-1.5 text-sm">录音语言（可选）<Input value={config.language} onChange={e => update({ language: e.target.value })} placeholder="留空自动识别；中文填 zh" /></label>
      <label className="space-y-1.5 text-sm">FFmpeg 路径（可选）<Input aria-label="FFmpeg 路径" value={config.ffmpegPath} onChange={e => update({ ffmpegPath: e.target.value })} placeholder="留空自动查找已安装的 ffmpeg" /></label>
    </div>
    <div className="space-y-2 rounded-xl border bg-muted p-4 text-xs leading-6 text-muted-foreground">
      <p>原始录音保存在本机并随数据备份。支持 MP3、M4A、WAV、MP4、WEBM、OGG、FLAC，单个最大 250 MB。</p>
      <p>超过 24 MB 的录音会使用已安装的 FFmpeg 压缩并按 15 分钟分段，依次转写。缺少 FFmpeg 时仍可导入原件、播放和手动补充文字稿。</p>
      <p>配置自动保存在本机。第三方服务由你自行开通；兼容服务需要支持 POST /audio/transcriptions 与 JSON 文字响应。</p>
      <a className="inline-block underline underline-offset-4" href="https://platform.openai.com/docs/api-reference/audio/createTranscription" target="_blank" rel="noreferrer">查看官方转写接口文档 ↗</a>
    </div>
  </div>;
}
