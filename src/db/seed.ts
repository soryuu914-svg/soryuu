import { db } from './index';
import { addProject } from './project';
import { addCharacter } from './character';
import { addWorldSetting } from './world';
import { addVolume, addChapter } from './outline';

// 初始化示例数据
export async function seedDatabase(): Promise<void> {
  // 检查是否已有数据
  const projectCount = await db.projects.count();

  if (projectCount > 0) {
    console.log('数据库已有数据，跳过初始化');
    return;
  }

  console.log('开始初始化示例数据...');

  const now = Date.now();

  // 创建示例项目
  const projectId = await addProject({
    name: '修仙世界：从凡人到仙帝',
    description: '一个平凡少年在修仙世界崛起的故事',
    createdAt: now,
    updatedAt: now,
  });

  console.log(`创建项目：ID ${projectId}`);

  // 创建示例人物
  await addCharacter({
    projectId,
    name: '林逸',
    description: '主角，天赋平平但心性坚韧的少年，从小山村走出，最终成为仙帝。',
    createdAt: now,
    updatedAt: now,
  });

  await addCharacter({
    projectId,
    name: '苏浅语',
    description: '女主，天才修士，冰清玉洁，与主角青梅竹马。',
    createdAt: now,
    updatedAt: now,
  });

  console.log('创建了 2 个人物');

  // 创建示例世界观设定
  await addWorldSetting({
    projectId,
    name: '修炼体系',
    title: '修炼体系',
    content: `修炼境界：
1. 炼气期（1-9层）
2. 筑基期
3. 金丹期
4. 元婴期
5. 化神期
6. 渡劫期
7. 大乘期
8. 仙人境

每个大境界分为初期、中期、后期、巅峰四个小阶段。`,
    createdAt: now,
    updatedAt: now,
  });

  await addWorldSetting({
    projectId,
    name: '世界格局',
    title: '世界格局',
    content: `修仙世界分为：
- 下界：凡人世界，灵气稀薄
- 中界：修士聚集地，宗门林立
- 上界：仙人居所，真正的仙域

主角从下界一个小山村开始修炼，逐步进入更高层次的世界。`,
    createdAt: now,
    updatedAt: now,
  });

  console.log('创建了 2 个世界观设定');

  // 创建示例卷和章节
  const volumeId = await addVolume({
    projectId,
    name: '第一卷：山村启程',
    title: '第一卷：山村启程',
    order: 1,
    index: 1,
    createdAt: now,
    updatedAt: now,
  });

  await addChapter({
    projectId,
    volumeId,
    title: '第一章：少年林逸',
    content: '青山村，位于大燕国最偏远的角落...',
    order: 1,
    index: 1,
    createdAt: now,
    updatedAt: now,
  });

  await addChapter({
    projectId,
    volumeId,
    title: '第二章：奇遇',
    content: '林逸在后山发现了一块发光的石头...',
    order: 2,
    index: 2,
    createdAt: now,
    updatedAt: now,
  });

  console.log('创建了 1 卷 2 章');
  console.log('示例数据初始化完成！');
}
