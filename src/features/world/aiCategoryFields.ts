// AI 生成对话框的分类专属字段配置
interface FieldConfig {
  key: string;
  label: string;
  type: 'select' | 'input';
  placeholder?: string;
  options?: string[];
}

export const aiCategoryFields: Record<string, FieldConfig[]> = {
  '大陆/区域': [
    { key: 'size', label: '范围大小', type: 'select', options: ['小型', '中型', '大型', '超大型'] },
    { key: 'terrain', label: '地形特点', type: 'select', options: ['多山', '平原', '沙漠', '森林', '海洋', '极地'] },
    { key: 'aura', label: '灵气浓度', type: 'select', options: ['低', '中', '高', '极高'] },
  ],
  '城市/城镇': [
    { key: 'scale', label: '规模', type: 'select', options: ['村', '镇', '小城', '大城', '王都'] },
    { key: 'industry', label: '特色产业', type: 'select', options: ['炼丹', '炼器', '贸易', '军事', '农业'] },
    { key: 'location', label: '位置', type: 'select', options: ['山脚', '平原', '海岛', '边境'] },
  ],
  '秘境/禁地': [
    { key: 'danger', label: '危险等级', type: 'select', options: ['低危', '中危', '高危', '绝地'] },
    { key: 'reward', label: '产出类型', type: 'select', options: ['灵药', '功法', '法宝', '灵石'] },
  ],
  '山川/地貌': [
    { key: 'form', label: '形态', type: 'input', placeholder: '如：剑形山峰' },
    { key: 'feature', label: '特殊特征', type: 'input', placeholder: '如：常年积雪' },
  ],
  '宗门/门派': [
    { key: 'stance', label: '定位', type: 'select', options: ['正道', '中立', '邪派'] },
    { key: 'tier', label: '规模', type: 'select', options: ['一流', '二流', '三流', '隐世'] },
    { key: 'major', label: '主修方向', type: 'select', options: ['剑修', '丹修', '器修', '符修', '体修'] },
  ],
  '家族': [
    { key: 'heritage', label: '传承年限', type: 'select', options: ['百年内', '数百年', '千年', '上古'] },
    { key: 'stance', label: '立场', type: 'select', options: ['正道', '中立', '邪派'] },
  ],
  '王朝/帝国': [
    { key: 'territory', label: '版图规模', type: 'select', options: ['小国', '中等', '大国', '帝国'] },
    { key: 'strength', label: '国力', type: 'select', options: ['弱小', '中等', '强盛', '霸主'] },
  ],
  '组织/商会': [
    { key: 'business', label: '主营业务', type: 'select', options: ['丹药', '法宝', '灵材', '情报', '杀手'] },
    { key: 'range', label: '势力范围', type: 'select', options: ['地区', '一州', '多州', '全大陆'] },
  ],
  '邪派/魔道': [
    { key: 'method', label: '手段', type: 'select', options: ['血祭', '炼魂', '夺舍', '鬼道', '蛊毒'] },
    { key: 'stance', label: '与正道关系', type: 'select', options: ['敌对', '暗斗', '对峙'] },
  ],
  '修炼境界': [
    { key: 'startRealm', label: '起点境界', type: 'input', placeholder: '如：筑基、斗王（留空则从最低境界开始）' },
    { key: 'endRealm', label: '终点境界', type: 'input', placeholder: '如：渡劫、斗帝（留空则AI自由决定）' },
    { key: 'count', label: '境界数量', type: 'select', options: ['不限', '5个', '8个', '10个'] },
  ],
  '功法/武技': [
    { key: 'grade', label: '品阶', type: 'select', options: ['黄阶', '玄阶', '地阶', '天阶', '神阶'] },
    { key: 'type', label: '类型', type: 'select', options: ['攻击', '防御', '身法', '辅助'] },
  ],
  '血脉/体质': [
    { key: 'source', label: '来源', type: 'select', options: ['神兽', '上古', '异种', '天生'] },
    { key: 'bias', label: '偏向', type: 'select', options: ['力量', '速度', '感知', '恢复'] },
  ],
  '神通/秘术': [
    { key: 'effect', label: '效果类型', type: 'select', options: ['攻击', '防御', '辅助', '禁忌'] },
    { key: 'cost', label: '代价', type: 'select', options: ['寿元', '修为', '心境', '无'] },
  ],
  '武器/法宝': [
    { key: 'grade', label: '品阶', type: 'select', options: ['凡器', '灵器', '法宝', '仙器'] },
    { key: 'type', label: '类型', type: 'select', options: ['剑', '刀', '枪', '钟', '鼎', '塔', '其他'] },
    { key: 'attr', label: '特殊属性', type: 'select', options: ['火', '冰', '雷', '风', '毒', '无'] },
  ],
  '丹药': [
    { key: 'effect', label: '功效方向', type: 'select', options: ['疗伤', '突破', '增寿', '解毒', '增功'] },
    { key: 'rarity', label: '稀有度', type: 'select', options: ['普通', '稀有', '极品', '传说'] },
  ],
  '灵材/灵物': [
    { key: 'use', label: '用途', type: 'select', options: ['炼器', '炼丹', '阵法', '其他'] },
    { key: 'rarity', label: '稀有度', type: 'select', options: ['常见', '稀有', '罕见', '传说'] },
  ],
  '上古事件': [
    { key: 'time', label: '时间', type: 'input', placeholder: '如：万年前' },
    { key: 'impact', label: '影响范围', type: 'select', options: ['局部', '一州', '全大陆', '全界'] },
  ],
  '王朝更迭': [
    { key: 'dynasty', label: '朝代名', type: 'input', placeholder: '如：大周→大炎' },
  ],
  '传说/人物': [
    { key: 'name', label: '人物名', type: 'input', placeholder: '如：剑仙李青莲' },
    { key: 'realm', label: '修为', type: 'select', options: ['筑基', '金丹', '元婴', '化神', '渡劫', '仙人'] },
  ],
  '妖族': [
    { key: 'relation', label: '与人类关系', type: 'select', options: ['敌对', '中立', '同盟', '奴役'] },
    { key: 'talent', label: '天赋方向', type: 'select', options: ['体魄', '法术', '神通', '速度'] },
  ],
  '魔族': [
    { key: 'relation', label: '与人类关系', type: 'select', options: ['敌对', '中立', '同盟', '奴役'] },
    { key: 'talent', label: '天赋方向', type: 'select', options: ['体魄', '法术', '神通', '速度'] },
  ],
  '天道/规则': [
    { key: 'target', label: '约束对象', type: 'select', options: ['修士', '凡人', '所有生灵'] },
    { key: 'consequence', label: '违反后果', type: 'select', options: ['天劫', '寿元减少', '境界跌落'] },
  ],
  '禁忌/诅咒': [
    { key: 'trigger', label: '触发条件', type: 'input', placeholder: '如：提及上古魔名' },
    { key: 'effect', label: '效果', type: 'input', placeholder: '如：神魂受创' },
  ],
  '自定义': [
    { key: 'requirement', label: '需求描述', type: 'input', placeholder: '自由描述您的需求' },
  ],
};
