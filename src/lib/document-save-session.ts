export type DocumentSaveState = 'saved' | 'dirty' | 'saving' | 'error';

/** 串行导出与保存，保存中的新输入继续保持 dirty；错误不清除本地编辑。 */
export class DocumentSaveSession {
  private edits = 0;
  private persisted = 0;
  private pending: Promise<void> | null = null;
  private timer: ReturnType<typeof setTimeout> | undefined;
  constructor(
    private revision: number,
    private serialize: () => Promise<number[]>,
    private readonly write: (revision: number, bytes: number[]) => Promise<number>,
    private readonly report: (state: DocumentSaveState, error?: unknown) => void,
  ) {}

  get dirty() { return this.edits !== this.persisted; }
  get currentRevision() { return this.revision; }

  /** 编辑器销毁前截取最终内容；排队中的旧保存完成后也只能读取这份快照。 */
  finish(bytes: Promise<number[]>): Promise<void> {
    this.serialize = () => bytes;
    // flush 可能仍在等待上一次写入，提前接住快照失败以免出现未处理的拒绝。
    void bytes.catch(() => {});
    return this.flush();
  }

  changed() {
    this.edits++;
    this.report('dirty');
    clearTimeout(this.timer);
    this.timer = setTimeout(() => { void this.flush().catch(() => {}); }, 1200);
  }

  flush(): Promise<void> {
    clearTimeout(this.timer);
    if (this.pending) return this.pending;
    if (!this.dirty) return Promise.resolve();
    this.pending = this.save().finally(() => { this.pending = null; });
    return this.pending;
  }

  private async save() {
    try {
      while (this.dirty) {
        this.report('saving');
        const generation = this.edits;
        const bytes = await this.serialize();
        this.revision = await this.write(this.revision, bytes);
        this.persisted = generation;
      }
      this.report('saved');
    } catch (error) {
      this.report('error', error);
      throw error;
    }
  }
}
