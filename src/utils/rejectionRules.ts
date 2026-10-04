import { getActiveRules } from '../db/rejectionCase';

/**
 * 格式化避雷规则为 prompt 前缀
 * @param rules 规则列表
 * @param maxRules 最多显示的规则数量，默认 15
 * @returns 格式化后的规则文本
 */
export function formatRulesPrompt(rules: string[], maxRules: number = 15): string {
  if (rules.length === 0) return '';

  const limitedRules = rules.slice(0, maxRules);
  const rulesText = limitedRules.map((rule, index) => `${index + 1}. ${rule}`).join('\n');

  return `【避雷规则（生成内容时必须严格遵守，否则会被平台拒稿）】
${rulesText}

`;
}

/**
 * 获取并格式化避雷规则
 * @param projectId 作品 ID
 * @param enabled 是否启用规则，默认 true
 * @returns 格式化后的规则文本
 */
export async function getFormattedRules(projectId?: number, enabled: boolean = true): Promise<string> {
  if (!enabled) return '';

  try {
    const rules = await getActiveRules(projectId);
    return formatRulesPrompt(rules);
  } catch (error) {
    console.error('获取避雷规则失败:', error);
    return '';
  }
}
