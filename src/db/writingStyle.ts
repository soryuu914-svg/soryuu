import { db } from './index';
import type { WritingStyle } from '../types';

// 获取所有写作技巧
export async function getAllTechniques(): Promise<WritingStyle[]> {
  return db.writingStyles.where('type').equals('technique').sortBy('createdAt');
}

// 获取所有文风
export async function getAllStyles(): Promise<WritingStyle[]> {
  return db.writingStyles.where('type').equals('style').sortBy('createdAt');
}

// 根据 ID 获取单个
export async function getWritingStyleById(id: number): Promise<WritingStyle | undefined> {
  return db.writingStyles.get(id);
}

// 新增
export async function addWritingStyle(style: Omit<WritingStyle, 'id'>): Promise<number> {
  return db.writingStyles.add({
    ...style,
    createdAt: Date.now(),
  });
}

// 更新
export async function updateWritingStyle(id: number, updates: Partial<WritingStyle>): Promise<number> {
  return db.writingStyles.update(id, updates);
}

// 删除
export async function deleteWritingStyle(id: number): Promise<void> {
  return db.writingStyles.delete(id);
}

// 初始化预置内容
export async function initBuiltinWritingStyles(): Promise<void> {
  const builtinData: Omit<WritingStyle, 'id'>[] = [
    // ========== 写作技巧（20 条）==========
    {
      type: 'technique',
      title: '钩子·悬念式',
      description: '结尾抛出一个未解的谜',
      content: '本章结尾必须留下一个未解的疑问或悬念，让读者想知道后面发生了什么。悬念要具体、有画面感，不是泛泛的"接下来会怎样"。比如：主角打开木盒，里面是一枚他十年前亲手埋葬的戒指。写大纲 hook 字段时，把悬念压缩成一个 ≤20 字的具体画面（如"木盒里是十年前埋下的戒指"），不要写成"主角发现秘密"这种概括。',
      category: '钩子',
      isBuiltin: true,
      tags: ['钩子', '悬念', '结尾'],
      createdAt: Date.now(),
    },
    {
      type: 'technique',
      title: '钩子·危机式',
      description: '结尾让主角陷入险境',
      content: '本章结尾要让主角陷入一个具体的、紧迫的危险中（比如被追杀、被识破、陷入绝境），读者会担心主角的安危，想知道他如何脱身。写大纲 hook 字段时压缩成 ≤20 字的具体危机画面（如"追兵封住了下山唯一的路"），不要只写"主角陷入危险"。',
      category: '钩子',
      isBuiltin: true,
      tags: ['钩子', '危机', '结尾'],
      createdAt: Date.now(),
    },
    {
      type: 'technique',
      title: '钩子·信息式',
      description: '结尾揭示一个颠覆前文的信息',
      content: '本章结尾要揭示一个信息，颠覆读者对前文的认知。比如：一直帮助主角的师父，其实是幕后黑手。写大纲 hook 字段时只留这个信息本身（≤20 字，如"师父袖口露出魔宗印记"）。',
      category: '钩子',
      isBuiltin: true,
      tags: ['钩子', '反转', '结尾'],
      createdAt: Date.now(),
    },
    {
      type: 'technique',
      title: '钩子·反差式',
      description: '结尾制造与读者预期相反的转折',
      content: '本章结尾要制造一个反差——读者以为主角要赢了，结果输了；以为要死了，结果活了。反差要有铺垫，不能生硬。写大纲 hook 字段时只写反差那一下（≤20 字，如"他刚举起剑，剑却断了"）。',
      category: '钩子',
      isBuiltin: true,
      tags: ['钩子', '反差', '结尾'],
      createdAt: Date.now(),
    },
    {
      type: 'technique',
      title: '爆点·打脸式',
      description: '用实力/身份/成就碾压对方',
      content: '爆点是打脸场面。正文展开时至少 300 字，结构：对手嚣张（嘲讽、挑衅、碾压）→ 主角隐忍 → 关键时刻用实力反杀 → 对手震惊 → 旁观者哗然。写大纲 climax 字段时不要写整个流程，只写最爽的那一个具体画面（≤20 字，如"他一掌拍碎对方的护体金光"）。',
      category: '爆点',
      isBuiltin: true,
      tags: ['爆点', '打脸', '反转'],
      createdAt: Date.now(),
    },
    {
      type: 'technique',
      title: '爆点·反杀式',
      description: '从绝境翻盘',
      content: '爆点是主角从绝境翻盘。正文展开时至少 300 字，结构：主角陷入死局 → 对手以为胜券在握 → 主角掏出底牌/爆发 → 局势逆转 → 对手崩溃。写大纲 climax 字段时只写逆转发生的那一个画面（≤20 字，如"他从血泊里站起来，握住断刀"）。',
      category: '爆点',
      isBuiltin: true,
      tags: ['爆点', '反杀', '翻盘'],
      createdAt: Date.now(),
    },
    {
      type: 'technique',
      title: '爆点·揭秘式',
      description: '揭穿某个一直被隐藏的真相',
      content: '爆点是揭露一个被隐藏的真相。正文要先用少量伏笔铺垫，再在本章揭晓时给读者"原来如此"的冲击。写大纲 climax 字段时只写揭晓的那一瞬间（≤20 字，如"族谱上赫然写着他的本名"）。',
      category: '爆点',
      isBuiltin: true,
      tags: ['爆点', '真相', '揭秘'],
      createdAt: Date.now(),
    },
    {
      type: 'technique',
      title: '爆点·反转式',
      description: '让对手以为稳赢时被主角翻盘',
      content: '爆点是一个反转场面：对手优势明显，主角看似必败，但主角用一个出人意料的手段反败为胜。写大纲 climax 字段时只写手段亮出的那一刻（≤20 字，如"他捏碎玉符，场中灵气倒灌"）。',
      category: '爆点',
      isBuiltin: true,
      tags: ['爆点', '反转', '翻盘'],
      createdAt: Date.now(),
    },
    {
      type: 'technique',
      title: '节奏·紧凑',
      description: '短句为主，每段一个信息点',
      content: '叙述节奏紧凑：短句为主，单段不超过 3 句，每段推进一个信息点或一个动作。不要用大段环境描写或内心独白拖慢节奏。',
      category: '节奏',
      isBuiltin: true,
      tags: ['节奏', '紧凑', '短句'],
      createdAt: Date.now(),
    },
    {
      type: 'technique',
      title: '节奏·舒缓',
      description: '长句+环境+心理活动',
      content: '叙述节奏舒缓：允许长句、环境描写、心理活动。适合过渡章节、情感戏、日常戏，让读者喘口气。',
      category: '节奏',
      isBuiltin: true,
      tags: ['节奏', '舒缓', '过渡'],
      createdAt: Date.now(),
    },
    {
      type: 'technique',
      title: '节奏·张弛',
      description: '紧一段松一段交替',
      content: '叙述节奏张弛有度：一段紧张的动作/冲突后，接一段舒缓的环境/对话。避免全程高强度，也避免长时间平淡。',
      category: '节奏',
      isBuiltin: true,
      tags: ['节奏', '张弛', '节奏控制'],
      createdAt: Date.now(),
    },
    {
      type: 'technique',
      title: '人物·主角光环',
      description: '关键时候有贵人或外挂',
      content: '主角在关键时刻要展现出超越常人的特质——不是靠运气，而是靠他独有的能力、洞察、决心或人格魅力。',
      category: '人物',
      isBuiltin: true,
      tags: ['人物', '主角', '光环'],
      createdAt: Date.now(),
    },
    {
      type: 'technique',
      title: '人物·反差萌',
      description: '强者有弱点，弱者有天赋',
      content: '每个重要人物都要有反差：强者有软肋，弱者有天赋，反派有苦衷。人物不是标签，是立体的。',
      category: '人物',
      isBuiltin: true,
      tags: ['人物', '反差', '立体'],
      createdAt: Date.now(),
    },
    {
      type: 'technique',
      title: '描写·动作',
      description: '用动作表现情绪',
      content: '用动作、细节、环境来表现人物情绪，不要直接写"他很生气"。写他攥紧拳头、指甲掐进掌心、呼吸变粗。',
      category: '描写',
      isBuiltin: true,
      tags: ['描写', '动作', '细节'],
      createdAt: Date.now(),
    },
    {
      type: 'technique',
      title: '描写·对话',
      description: '对话推动剧情',
      content: '对话要有信息量，每一句都在推进剧情、暴露性格或制造张力。不要写"你好吗""我很好"这种无意义对话。',
      category: '描写',
      isBuiltin: true,
      tags: ['描写', '对话', '剧情'],
      createdAt: Date.now(),
    },
    {
      type: 'technique',
      title: '冲突·目标对立',
      description: '双方目标不可调和',
      content: '冲突的核心是双方目标不可调和。每个人物都要有清晰的目标，两个目标撞在一起，冲突自然产生。',
      category: '冲突',
      isBuiltin: true,
      tags: ['冲突', '目标', '对立'],
      createdAt: Date.now(),
    },
    {
      type: 'technique',
      title: '冲突·信息差',
      description: '一方知道另一方不知道',
      content: '利用信息差制造冲突和张力：读者知道主角不知道的信息，或主角知道读者不知道的信息，制造悬念。',
      category: '冲突',
      isBuiltin: true,
      tags: ['冲突', '信息差', '悬念'],
      createdAt: Date.now(),
    },
    {
      type: 'technique',
      title: '开篇·动作',
      description: '直接进入打斗/追逐',
      content: '章节开篇前 100 字内直接进入动作场面（打斗、追逐、突发危机），不要从环境描写或心理活动开始。',
      category: '开篇',
      isBuiltin: true,
      tags: ['开篇', '动作', '节奏'],
      createdAt: Date.now(),
    },
    {
      type: 'technique',
      title: '开篇·悬念',
      description: '前100字抛谜题',
      content: '章节开篇前 100 字内抛出一个谜题、冲突或反差，让读者立刻产生疑问，想继续读。',
      category: '开篇',
      isBuiltin: true,
      tags: ['开篇', '悬念', '钩子'],
      createdAt: Date.now(),
    },
    {
      type: 'technique',
      title: '开篇·反差',
      description: '制造预期反差',
      content: '章节开篇制造一个与读者预期相反的场景，比如"我在末日醒来，第一件事是给自己泡了杯茶"。',
      category: '开篇',
      isBuiltin: true,
      tags: ['开篇', '反差', '吸引'],
      createdAt: Date.now(),
    },

    // ========== 文风风格（5 套）==========
    {
      type: 'style',
      title: '番茄风',
      description: '短句、快节奏、爽点前置',
      content: '短句为主，单段不超过 3 句。对话密集，口语化，避免书面腔。爽点前置，每 300-500 字一个钩子或打脸。用词直接，不绕弯子。',
      category: '',
      isBuiltin: true,
      tags: ['文风', '快节奏', '爽文'],
      createdAt: Date.now(),
    },
    {
      type: 'style',
      title: '起点风',
      description: '稳重大气，世界观宏大',
      content: '叙述稳重，用词雅致但不古板。允许较长的环境描写和心理活动。节奏稳中带快，追求格局感和史诗感。对话有分寸，不轻浮。',
      category: '',
      isBuiltin: true,
      tags: ['文风', '稳重', '史诗'],
      createdAt: Date.now(),
    },
    {
      type: 'style',
      title: '晋江风',
      description: '细腻情感，文艺',
      content: '细腻的情感描写，重视人物内心世界。文字有意境，善用比喻和意象。对话含蓄，留白多。节奏偏慢，追求情绪张力。',
      category: '',
      isBuiltin: true,
      tags: ['文风', '情感', '文艺'],
      createdAt: Date.now(),
    },
    {
      type: 'style',
      title: '仙侠风',
      description: '古风、意境、慢节奏',
      content: '古风用词，大量使用山水、意境、禅意类意象。叙述节奏舒缓，重视氛围营造。对话文言化但不晦涩。战斗描写有意境感。',
      category: '',
      isBuiltin: true,
      tags: ['文风', '仙侠', '古风'],
      createdAt: Date.now(),
    },
    {
      type: 'style',
      title: '都市风',
      description: '轻松幽默、对话多',
      content: '轻松幽默的叙述语气，多用现代口语和网络化表达。对话多，动作描写干净利落。节奏明快，避免长篇大论的描写。',
      category: '',
      isBuiltin: true,
      tags: ['文风', '都市', '幽默'],
      createdAt: Date.now(),
    },
  ];

  // 1. 先检查表里数据
  const rows = await db.writingStyles.toArray();

  // 2. 兜底去重：同 type+title 只保留最早一条
  const seen = new Set<string>();
  const toDelete: number[] = [];
  for (const row of rows) {
    const key = `${row.type}|${row.title}`;
    if (seen.has(key)) {
      toDelete.push(row.id!);
    } else {
      seen.add(key);
    }
  }
  if (toDelete.length > 0) {
    await db.writingStyles.bulkDelete(toDelete);
  }

  // 3. 去重后再查一次
  const afterDedup = await db.writingStyles.toArray();

  // 4. 如果表为空，写入预置
  if (afterDedup.length === 0) {
    await db.writingStyles.bulkAdd(builtinData);
    return;
  }

  // 5. 否则：升级预置文案（保留原有逻辑；用户自建条目不动）
  for (const item of builtinData) {
    const match = afterDedup.find(
      (r) => r.isBuiltin === true && r.type === item.type && r.title === item.title
    );
    if (match?.id && match.content !== item.content) {
      await db.writingStyles.update(match.id, {
        description: item.description,
        content: item.content,
        tags: item.tags,
      });
    }
  }
}

/**
 * 按 category 数组读取写作技巧，拼成 prompt 段
 * @param categories 如 ['钩子', '爆点', '节奏']
 * @returns 拼好的 prompt 字符串（空时返回空串）
 */
export async function readTechniquesByCategory(categories: string[]): Promise<string> {
  if (categories.length === 0) return '';

  const all = await db.writingStyles
    .where('type')
    .equals('technique')
    .toArray();

  const matched = all.filter(t => t.category && categories.includes(t.category)).slice(0, 8);

  if (matched.length === 0) return '';

  let result = '\n【写作技巧要求】（请严格遵守以下技法）\n';
  matched.forEach((t, idx) => {
    result += `\n${idx + 1}. ${t.title}\n${t.content}\n`;
  });

  return result;
}

