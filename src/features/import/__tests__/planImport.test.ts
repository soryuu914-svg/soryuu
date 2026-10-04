import { describe, expect, it } from 'vitest';
import { IMPORT_VOLUME_TITLE, planImport } from '../planImport';

const NOW = 1_700_000_000_000;

describe('planImport —— 作品', () => {
  it('作品名去掉首尾空白', () => {
    const plan = planImport({ projectName: '  我的修仙传  ', chapters: [], now: NOW });
    expect(plan.project.name).toBe('我的修仙传');
  });

  it('作品名为空 → 兜底名', () => {
    expect(planImport({ projectName: '   ', chapters: [], now: NOW }).project.name).toBe('未命名作品');
  });

  it('时间戳统一用传入的 now', () => {
    const plan = planImport({ projectName: '甲', chapters: [], now: NOW });
    expect(plan.project.createdAt).toBe(NOW);
    expect(plan.project.updatedAt).toBe(NOW);
    expect(plan.volume.createdAt).toBe(NOW);
  });

  it('题材/简介留空时给 undefined（不写空串，避免列表页显示空白项）', () => {
    const plan = planImport({ projectName: '甲', genre: '  ', description: '', chapters: [], now: NOW });
    expect(plan.project.genre).toBeUndefined();
    expect(plan.project.description).toBeUndefined();
  });

  it('题材/简介有值时去掉首尾空白', () => {
    const plan = planImport({
      projectName: '甲',
      genre: ' 仙侠 ',
      description: ' 一稿 ',
      chapters: [],
      now: NOW,
    });
    expect(plan.project.genre).toBe('仙侠');
    expect(plan.project.description).toBe('一稿');
  });
});

describe('planImport —— ★ 必须建一卷', () => {
  it('默认卷名是「正文」', () => {
    const plan = planImport({ projectName: '甲', chapters: [], now: NOW });
    expect(plan.volume.title).toBe(IMPORT_VOLUME_TITLE);
    expect(plan.volume.index).toBe(1);
  });

  it('★ 兼容字段双写：title/name、index/order 四件套都给全', () => {
    const plan = planImport({ projectName: '甲', chapters: [], now: NOW });
    expect(plan.volume).toEqual({
      index: 1,
      title: '正文',
      name: '正文',
      order: 1,
      createdAt: NOW,
      updatedAt: NOW,
    });
  });

  it('可以自定义卷名', () => {
    const plan = planImport({ projectName: '甲', volumeTitle: ' 第一卷 ', chapters: [], now: NOW });
    expect(plan.volume.title).toBe('第一卷');
    expect(plan.volume.name).toBe('第一卷');
  });
});

describe('planImport —— 章节', () => {
  it('★ index 与 order 都从 1 开始且一致（getChaptersByProject 按 order 排序）', () => {
    const plan = planImport({
      projectName: '甲',
      chapters: [
        { title: '风起', body: '一' },
        { title: '落雨', body: '二' },
        { title: '归人', body: '三' },
      ],
      now: NOW,
    });
    expect(plan.chapters.map((c) => c.index)).toEqual([1, 2, 3]);
    expect(plan.chapters.map((c) => c.order)).toEqual([1, 2, 3]);
  });

  it('细纲/钩子/爆点这些字段给空串占位，不留 undefined', () => {
    const plan = planImport({ projectName: '甲', chapters: [{ title: 'a', body: 'b' }], now: NOW });
    expect(plan.chapters[0].outline).toBe('');
    expect(plan.chapters[0].hook).toBe('');
    expect(plan.chapters[0].climax).toBe('');
    expect(plan.chapters[0].chapterStructure).toBe('');
    expect(plan.chapters[0].emotion).toBe('');
  });

  it('标题为空 → 自动编「第 N 章」', () => {
    const plan = planImport({
      projectName: '甲',
      chapters: [{ title: '  ', body: '正文' }],
      now: NOW,
    });
    expect(plan.chapters[0].title).toBe('第 1 章');
  });

  it('不写 status —— 导入的稿子不该假装是「草稿」或「已完成」', () => {
    const plan = planImport({ projectName: '甲', chapters: [{ title: 'a', body: 'b' }], now: NOW });
    expect(plan.chapters[0].status).toBeUndefined();
  });

  it('★ TXT：正文走纯文本转换（按空行分段 + 单换行 br）', () => {
    const plan = planImport({
      projectName: '甲',
      chapters: [{ title: '风起', body: '甲\n乙\n\n丙' }],
      now: NOW,
    });
    expect(plan.chapters[0].content).toBe('<p>甲<br>乙</p><p>丙</p>');
  });

  it('★ MD：正文走 Markdown 转换', () => {
    const plan = planImport({
      projectName: '甲',
      chapters: [{ title: '风起', body: '# 标题\n**粗**' }],
      markdown: true,
      now: NOW,
    });
    expect(plan.chapters[0].content).toBe('<h1>标题</h1><p><strong>粗</strong></p>');
  });

  it('MD 开关不传时等同纯文本', () => {
    const plan = planImport({
      projectName: '甲',
      chapters: [{ title: '风起', body: '# 标题' }],
      now: NOW,
    });
    expect(plan.chapters[0].content).toBe('<p># 标题</p>');
  });

  it('wordCount 与内容一起算出来（对齐编辑器口径）', () => {
    const plan = planImport({
      projectName: '甲',
      chapters: [{ title: '风起', body: '甲\n\n乙' }],
      now: NOW,
    });
    expect(plan.chapters[0].wordCount).toBe(4); // "甲\n\n乙"
  });
});

describe('planImport —— ★ .docx 已渲染好的 html', () => {
  it('raw.html 有值时直接用，不再走 toEditorHtml', () => {
    const plan = planImport({
      projectName: '甲',
      chapters: [{ title: '第一章 风起', body: '风起了。', html: '<h1>第一章 风起</h1><p>风起了。</p>' }],
      now: NOW,
    });
    expect(plan.chapters[0].content).toBe('<h1>第一章 风起</h1><p>风起了。</p>');
  });

  it('★ 不会被二次转义：加粗 / 斜体 / 标题标签原样保留', () => {
    const plan = planImport({
      projectName: '甲',
      chapters: [{ title: 'a', body: '甲', html: '<p>甲<strong>加粗</strong>和<em>斜体</em></p>' }],
      now: NOW,
    });
    expect(plan.chapters[0].content).toBe('<p>甲<strong>加粗</strong>和<em>斜体</em></p>');
  });

  it('html 为空串时也算「已渲染」（不被当成纯文本再转一遍）', () => {
    const plan = planImport({ projectName: '甲', chapters: [{ title: 'a', body: 'b', html: '' }], now: NOW });
    expect(plan.chapters[0].content).toBe('');
  });

  it('html 优先于 markdown 开关（.docx 不经过 Markdown 转换）', () => {
    const plan = planImport({
      projectName: '甲',
      markdown: true,
      chapters: [{ title: 'a', body: '# 标题', html: '<p># 标题</p>' }],
      now: NOW,
    });
    expect(plan.chapters[0].content).toBe('<p># 标题</p>');
  });

  it('wordCount 按 html 口径算（标题文字也算进正文）', () => {
    const plan = planImport({
      projectName: '甲',
      chapters: [{ title: 'a', body: 'x', html: '<h1>标题</h1><p>正文。</p>' }],
      now: NOW,
    });
    expect(plan.chapters[0].wordCount).toBe(7); // "标题" + \n\n + "正文。"
  });

  it('没有 html 的章节照旧走纯文本转换（同一次导入里可混用）', () => {
    const plan = planImport({
      projectName: '甲',
      chapters: [
        { title: 'a', body: '甲\n\n乙', html: '<p>甲</p><p>乙</p>' },
        { title: 'b', body: '丙\n\n丁' },
      ],
      now: NOW,
    });
    expect(plan.chapters[0].content).toBe('<p>甲</p><p>乙</p>');
    expect(plan.chapters[1].content).toBe('<p>丙</p><p>丁</p>');
  });
});

describe('planImport —— 统计', () => {
  it('chapterCount / wordCount / charCount', () => {
    const plan = planImport({
      projectName: '甲',
      chapters: [
        { title: 'a', body: '甲\n\n乙' }, // 4 字
        { title: 'b', body: '丙' }, // 1 字
      ],
      now: NOW,
    });
    expect(plan.stats.chapterCount).toBe(2);
    expect(plan.stats.wordCount).toBe(5);
    expect(plan.stats.charCount).toBe(5);
  });

  it('空章节列表 → 全 0', () => {
    const plan = planImport({ projectName: '甲', chapters: [], now: NOW });
    expect(plan.stats).toEqual({ chapterCount: 0, wordCount: 0, charCount: 0 });
    expect(plan.chapters).toEqual([]);
  });

  it('now 不传时用当前时间（不崩即可）', () => {
    const before = Date.now();
    const plan = planImport({ projectName: '甲', chapters: [] });
    expect(plan.project.createdAt).toBeGreaterThanOrEqual(before);
  });
});
