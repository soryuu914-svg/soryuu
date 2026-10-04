import { useState, useEffect } from 'react';
import { Shield, ChevronDown, ChevronUp } from 'lucide-react';
import { getActiveRules } from '../db/rejectionCase';

interface RejectionRulesToggleProps {
  projectId?: number;
  enabled: boolean;
  onToggle: (enabled: boolean) => void;
  className?: string;
}

export default function RejectionRulesToggle({
  projectId,
  enabled,
  onToggle,
  className = '',
}: RejectionRulesToggleProps) {
  const [rules, setRules] = useState<string[]>([]);
  const [expanded, setExpanded] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadRules();
  }, [projectId]);

  const loadRules = async () => {
    setLoading(true);
    try {
      const activeRules = await getActiveRules(projectId);
      setRules(activeRules);
    } catch (error) {
      console.error('加载避雷规则失败:', error);
      setRules([]);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className={`text-xs text-muted-foreground ${className}`}>
        加载避雷规则...
      </div>
    );
  }

  const rulesCount = rules.length;

  return (
    <div className={`text-xs ${className}`}>
      <div className="flex items-center gap-2">
        <Shield size={14} className={enabled ? 'text-orange-600' : 'text-muted-foreground'} />

        {rulesCount > 0 ? (
          <>
            <button
              onClick={() => setExpanded(!expanded)}
              className="text-orange-600 hover:underline flex items-center gap-1"
            >
              已应用 {rulesCount} 条避雷规则
              {expanded ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
            </button>

            <label className="flex items-center gap-1 cursor-pointer">
              <input
                type="checkbox"
                checked={enabled}
                onChange={(e) => onToggle(e.target.checked)}
                className="rounded border-input"
              />
              <span className="text-muted-foreground">启用</span>
            </label>
          </>
        ) : (
          <span className="text-muted-foreground">
            暂无避雷规则，去「AI 避雷词库」添加
          </span>
        )}
      </div>

      {expanded && rulesCount > 0 && (
        <div className="mt-2 p-3 bg-background border border-orange-200 rounded-lg">
          <div className="text-xs font-medium text-foreground mb-2">避雷规则列表：</div>
          <ul className="space-y-1 text-xs text-foreground">
            {rules.slice(0, 15).map((rule, index) => (
              <li key={index} className="flex items-start gap-2">
                <span className="text-orange-600 flex-shrink-0">{index + 1}.</span>
                <span>{rule}</span>
              </li>
            ))}
            {rules.length > 15 && (
              <li className="text-muted-foreground italic">... 及其他 {rules.length - 15} 条规则</li>
            )}
          </ul>
        </div>
      )}
    </div>
  );
}
