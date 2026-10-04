export interface TemplateField {
  key: string;
  label: string;
  placeholder: string;
}

export const legacyCategoryMap: Record<string, string> = {
  // 中文旧分类
  '大陆/区域': '地理', '城市/城镇': '地理', '秘境/禁地': '地理', '山川/地貌': '地理',
  '宗门/门派': '势力', '家族': '势力', '王朝/帝国': '势力', '组织/商会': '势力', '邪派/魔道': '势力',
  '功法/武技': '功法武技', '血脉/体质': '血脉体质', '神通/秘术': '神通秘术',
  '武器/法宝': '武器法宝', '灵材/灵物': '灵材灵物',
  '上古事件': '历史', '王朝更迭': '历史', '传说/人物': '历史',
  '妖族': '种族', '魔族': '种族',
  '天道/规则': '文化', '禁忌/诅咒': '文化', '自定义': '文化',
  // 英文旧键
  geography: '地理', faction: '势力', power: '修炼境界', item: '灵材灵物',
  history: '历史', race: '种族', other: '文化',
};

export const worldCategories = [
  {
    group: '世界设定',
    items: ['地理', '势力', '历史', '种族', '文化']
  },
  {
    group: '力量体系',
    items: ['修炼境界', '功法武技', '血脉体质', '神通秘术']
  },
  {
    group: '物品道具',
    items: ['武器法宝', '丹药', '灵材灵物']
  },
];

export const worldTemplates: Record<string, TemplateField[]> = {
  '地理': [
    { key: 'location', label: '位置范围', placeholder: '如：东荒大陆北方' },
    { key: 'feature', label: '地理特征', placeholder: '如：灵气稀薄，常年瘴气' },
  ],
  '势力': [
    { key: 'leader', label: '首领', placeholder: '如：青云真人' },
    { key: 'stance', label: '立场', placeholder: '正道 / 魔道 / 中立' },
    { key: 'level', label: '实力等级', placeholder: '如：一流势力' },
  ],
  '历史': [
    { key: 'event', label: '关键事件', placeholder: '如：千年前的人妖大战' },
    { key: 'impact', label: '影响', placeholder: '如：妖族退守北荒' },
  ],
  '种族': [
    { key: 'feature', label: '种族特点', placeholder: '如：天生体魄强大' },
    { key: 'relation', label: '与人类关系', placeholder: '如：敌对' },
  ],
  '文化': [
    { key: 'content', label: '文化内容', placeholder: '如：宗门大比每三年一次' },
  ],
  '修炼境界': [
    { key: 'ranks', label: '等级划分', placeholder: '如：炼气→筑基→金丹' },
    { key: 'breakthrough', label: '突破条件', placeholder: '如：灵石+感悟' },
  ],
  '功法武技': [
    { key: 'grade', label: '品阶', placeholder: '如：黄阶下品' },
    { key: 'effect', label: '效果', placeholder: '如：提升剑术威力三成' },
  ],
  '血脉体质': [
    { key: 'source', label: '来源', placeholder: '如：上古神兽血脉' },
    { key: 'ability', label: '能力', placeholder: '如：肉身强度翻倍' },
  ],
  '神通秘术': [
    { key: 'effect', label: '效果', placeholder: '如：短暂冻结时间' },
    { key: 'cost', label: '代价', placeholder: '如：消耗百年寿元' },
  ],
  '武器法宝': [
    { key: 'grade', label: '品阶', placeholder: '如：灵器' },
    { key: 'effect', label: '效果', placeholder: '如：削铁如泥' },
  ],
  '丹药': [
    { key: 'effect', label: '功效', placeholder: '如：突破金丹概率+30%' },
    { key: 'rarity', label: '稀有度', placeholder: '如：极品' },
  ],
  '灵材灵物': [
    { key: 'use', label: '用途', placeholder: '如：炼制飞剑的材料' },
    { key: 'origin', label: '产地', placeholder: '如：北荒冰原' },
  ],

  // 兼容老版本分类
  '大陆/区域': [
    { key: 'location', label: '位置范围', placeholder: '如：东荒大陆北方' },
    { key: 'feature', label: '地理特征', placeholder: '如：灵气稀薄，常年瘴气' },
  ],
  '城市/城镇': [
    { key: 'location', label: '位置范围', placeholder: '如：东荒大陆北方' },
    { key: 'feature', label: '地理特征', placeholder: '如：灵气稀薄，常年瘴气' },
  ],
  '秘境/禁地': [
    { key: 'location', label: '位置范围', placeholder: '如：东荒大陆北方' },
    { key: 'feature', label: '地理特征', placeholder: '如：灵气稀薄，常年瘴气' },
  ],
  '山川/地貌': [
    { key: 'location', label: '位置范围', placeholder: '如：东荒大陆北方' },
    { key: 'feature', label: '地理特征', placeholder: '如：灵气稀薄，常年瘴气' },
  ],
  '宗门/门派': [
    { key: 'leader', label: '首领', placeholder: '如：青云真人' },
    { key: 'stance', label: '立场', placeholder: '正道 / 魔道 / 中立' },
    { key: 'level', label: '实力等级', placeholder: '如：一流势力' },
  ],
  '家族': [
    { key: 'leader', label: '首领', placeholder: '如：青云真人' },
    { key: 'stance', label: '立场', placeholder: '正道 / 魔道 / 中立' },
    { key: 'level', label: '实力等级', placeholder: '如：一流势力' },
  ],
  '王朝/帝国': [
    { key: 'leader', label: '首领', placeholder: '如：青云真人' },
    { key: 'stance', label: '立场', placeholder: '正道 / 魔道 / 中立' },
    { key: 'level', label: '实力等级', placeholder: '如：一流势力' },
  ],
  '组织/商会': [
    { key: 'leader', label: '首领', placeholder: '如：青云真人' },
    { key: 'stance', label: '立场', placeholder: '正道 / 魔道 / 中立' },
    { key: 'level', label: '实力等级', placeholder: '如：一流势力' },
  ],
  '邪派/魔道': [
    { key: 'leader', label: '首领', placeholder: '如：青云真人' },
    { key: 'stance', label: '立场', placeholder: '正道 / 魔道 / 中立' },
    { key: 'level', label: '实力等级', placeholder: '如：一流势力' },
  ],
  '功法/武技': [
    { key: 'grade', label: '品阶', placeholder: '如：黄阶下品' },
    { key: 'effect', label: '效果', placeholder: '如：提升剑术威力三成' },
  ],
  '血脉/体质': [
    { key: 'source', label: '来源', placeholder: '如：上古神兽血脉' },
    { key: 'ability', label: '能力', placeholder: '如：肉身强度翻倍' },
  ],
  '神通/秘术': [
    { key: 'effect', label: '效果', placeholder: '如：短暂冻结时间' },
    { key: 'cost', label: '代价', placeholder: '如：消耗百年寿元' },
  ],
  '武器/法宝': [
    { key: 'grade', label: '品阶', placeholder: '如：灵器' },
    { key: 'effect', label: '效果', placeholder: '如：削铁如泥' },
  ],
  '灵材/灵物': [
    { key: 'use', label: '用途', placeholder: '如：炼制飞剑的材料' },
    { key: 'origin', label: '产地', placeholder: '如：北荒冰原' },
  ],
  '上古事件': [
    { key: 'event', label: '关键事件', placeholder: '如：千年前的人妖大战' },
    { key: 'impact', label: '影响', placeholder: '如：妖族退守北荒' },
  ],
  '王朝更迭': [
    { key: 'event', label: '关键事件', placeholder: '如：千年前的人妖大战' },
    { key: 'impact', label: '影响', placeholder: '如：妖族退守北荒' },
  ],
  '传说/人物': [
    { key: 'event', label: '关键事件', placeholder: '如：千年前的人妖大战' },
    { key: 'impact', label: '影响', placeholder: '如：妖族退守北荒' },
  ],
  '妖族': [
    { key: 'feature', label: '种族特点', placeholder: '如：天生体魄强大' },
    { key: 'relation', label: '与人类关系', placeholder: '如：敌对' },
  ],
  '魔族': [
    { key: 'feature', label: '种族特点', placeholder: '如：天生体魄强大' },
    { key: 'relation', label: '与人类关系', placeholder: '如：敌对' },
  ],
  '天道/规则': [
    { key: 'content', label: '文化内容', placeholder: '如：宗门大比每三年一次' },
  ],
  '禁忌/诅咒': [
    { key: 'content', label: '文化内容', placeholder: '如：宗门大比每三年一次' },
  ],
  '自定义': [
    { key: 'content', label: '内容', placeholder: '自由填写' },
  ],
  geography: [
    { key: 'location', label: '位置范围', placeholder: '如：东荒大陆北方，靠近妖族领地' },
    { key: 'feature', label: '地理特征', placeholder: '如：灵气稀薄，常年瘴气弥漫' },
  ],
  faction: [
    { key: 'leader', label: '首领', placeholder: '如：青云真人' },
    { key: 'stance', label: '立场', placeholder: '正道 / 魔道 / 中立' },
    { key: 'level', label: '实力等级', placeholder: '如：一流势力，有金丹期长老 3 人' },
  ],
  power: [
    { key: 'ranks', label: '等级划分', placeholder: '如：炼气→筑基→金丹→元婴→化神' },
    { key: 'breakthrough', label: '突破条件', placeholder: '如：需要灵石+天材地宝+感悟' },
  ],
  item: [
    { key: 'effect', label: '效果', placeholder: '如：服用后增加百年功力' },
    { key: 'use', label: '用途', placeholder: '如：炼制飞剑的材料' },
  ],
  history: [
    { key: 'event', label: '关键事件', placeholder: '如：千年前的人妖大战' },
    { key: 'impact', label: '影响', placeholder: '如：导致妖族退守北荒' },
  ],
  race: [
    { key: 'feature', label: '种族特点', placeholder: '如：天生体魄强大，寿命三百年' },
    { key: 'relation', label: '与人类关系', placeholder: '如：敌对、贸易、互不干涉' },
  ],
  other: [
    { key: 'content', label: '内容', placeholder: '自由填写' },
  ],
};

// 从描述文本解析字段值
export function parseDescription(description: string, category: string): Record<string, string> {
  const template = worldTemplates[category] || worldTemplates['自定义'];
  const result: Record<string, string> = {};

  // 尝试按【字段名】格式解析
  for (const field of template) {
    const regex = new RegExp(`【${field.label}】\\s*\\n([\\s\\S]*?)(?=\\n\\n【|$)`, 'i');
    const match = description.match(regex);
    if (match) {
      result[field.key] = match[1].trim();
    }
  }

  // 如果解析失败（没有任何字段匹配），把整段内容放到第一个字段
  if (Object.keys(result).length === 0 && description.trim()) {
    result[template[0].key] = description.trim();
  }

  return result;
}

// 从字段值生成描述文本
export function generateDescription(fields: Record<string, string>, category: string): string {
  const template = worldTemplates[category] || worldTemplates['自定义'];
  const parts: string[] = [];

  for (const field of template) {
    const value = fields[field.key]?.trim();
    if (value) {
      parts.push(`【${field.label}】\n${value}`);
    }
  }

  return parts.join('\n\n');
}
