/* Local checks for the standalone preview, not the production application. */
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const base = __dirname;
const html = fs.readFileSync(path.join(base, 'ios26-preview.html'), 'utf8');
const scripts = ['preview-zhihu-writing.js','preview-reading-store.js','preview-template-store.js','preview-progression.js','preview-practice.js','preview-quality.js','preview-pages.js', 'preview-books.js', 'preview-search.js', 'preview-features.js', 'preview-chapter-references.js', 'preview-ai.js'];
for (const file of scripts) new vm.Script(fs.readFileSync(path.join(base, file), 'utf8'), { filename: file });
const inline = [...html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g)].map(match => match[1]).filter(source => source.trim());
for (const source of inline) new vm.Script(source, { filename: 'preview-inline.js' });
const ids = [...html.matchAll(/\bid="([^"]+)"/g)].map(match => match[1]);
assert.equal(new Set(ids).size, ids.length, 'HTML IDs must be unique');
for (const view of ['home', 'bookhome', 'editor', 'characters', 'world', 'outline', 'cards', 'library', 'ideas', 'transfer', 'settings']) {
  assert.ok(ids.includes(view + '-view'), 'Missing view: ' + view);
}
const context = { window: {} };
vm.createContext(context);
vm.runInContext(fs.readFileSync(path.join(base, 'preview-features.js'), 'utf8'), context);
const parse = source => JSON.parse(JSON.stringify(context.window.parsePreviewManuscript(source)));
const serialize = context.window.serializePreviewChapters;
assert.deepEqual(parse('  '), []);
assert.deepEqual(parse('没有章节标题的正文'), [{ title: '正文', body: '没有章节标题的正文' }]);
assert.deepEqual(parse('说明\n第一章 来信\n张三收到信。\n第二章 回音\n林逸回信。'), [
  { title: '前言', body: '说明' }, { title: '第一章 来信', body: '张三收到信。' }, { title: '第二章 回音', body: '林逸回信。' }
]);
assert.deepEqual(parse('\uFEFF# Chapter 1 Arrival\r\nA\r\n\r\n## 第2章 回音\r\nB'), [
  { title: 'Chapter 1 Arrival', body: 'A' }, { title: '第2章 回音', body: 'B' }
]);
assert.deepEqual(parse('第一章\n第二章\n正文'), [{ title: '第一章', body: '' }, { title: '第二章', body: '正文' }]);
const chapters = [{ title: '第一章', body: '张三\n\n回信。' }, { title: '第二章', body: '林逸' }];
assert.equal(serialize('作品', chapters, 'txt'), '作品\n\n第一章\n\n张三\n\n回信。\n\n第二章\n\n林逸\n');
assert.equal(serialize('作品', chapters.slice(1), 'md'), '# 作品\n\n## 第二章\n\n林逸\n');
vm.runInContext(fs.readFileSync(path.join(base, 'preview-chapter-references.js'), 'utf8'), context);
vm.runInContext(fs.readFileSync(path.join(base, 'preview-ai.js'), 'utf8'), context);
const build = (id,values,ctx) => JSON.parse(JSON.stringify(context.window.buildPreviewAIResults(id,values,ctx)));
assert.equal(Object.keys(context.window.previewAIOperations).length,26);
assert.equal(build('book',{requirement:'张三'})[0].summary.includes('张三'),true);
assert.equal(build('person',{role:'配角',gender:'男',personality:'谨慎'})[0].role,'配角');
assert.equal(build('ideas',{genre:'都市',elements:'旧书店、时间循环',requirement:''}).length,3);
assert.deepEqual(Array.from(context.window.previewAIOperations.ideas.fields,field => field.key),['genre','elements','requirement']);
assert.ok(!context.window.previewAIOperations.ideas.fields.find(field => field.key === 'requirement').required);
assert.ok(build('ideas',{genre:'科幻',elements:'空间站、循环',requirement:''}).every(item => ['主角：','金手指方向：','主线目标：','核心矛盾：','整书主线：'].every(label => item.summary.includes(label))));
assert.ok(build('ideas',{genre:'都市',elements:'旧书店、循环',requirement:''}).every(item => !/三天后|触发条件|永久失去|能力的代价|学会一种技能/.test(item.summary)));
assert.ok(build('ideas',{genre:'悬疑',elements:'张三、旧照片',requirement:'温暖结局'}) .every(item => item.summary.includes('悬疑') && item.summary.includes('张三、旧照片') && item.summary.includes('温暖结局')));
assert.deepEqual(JSON.parse(JSON.stringify(build('ideas',{genre:'都市',elements:'旧书店',requirement:''},{bookHome:{name:'不应影响灵感的书名'},writing:{body:'不应读取的正文'}}))),JSON.parse(JSON.stringify(build('ideas',{genre:'都市',elements:'旧书店',requirement:''}))));
assert.equal(build('rules',{count:8,source:'模板句',reason:'重复'}).length,8);
assert.equal(build('world',{category:'修炼境界',startRealm:'见微',endRealm:'归真'})[0].title.includes('见微'),true);
assert.ok(build('world',{category:'势力',genre:'玄幻'}).every(item => item.kind === '势力' && item.summary && item.fields.length === 0));
assert.ok(build('person',{role:'配角',faction:'青云志'}).every(item => item.role === '配角' && item.faction === '青云志' && item.fields.length === 0));
const premise = '主角：小村少年。\n主线目标：打破仙门的修行垄断\n整书主线：少年为了救回被囚禁的家人，进入仙门，最终让普通人也能修行。';
const hero = build('person',{role:'主角',inspiration:premise,requirement:''})[0];
assert.ok(hero.goalMotivation.includes('打破仙门的修行垄断') && hero.goalMotivation.includes('救回被囚禁的家人'));
assert.ok(hero.goalMotivation.includes('要做什么：') && hero.goalMotivation.includes('为什么：') && hero.goalMotivation.includes('推进方向：'));
assert.equal(build('person',{role:'主角'})[0].goalMotivation,'','No invented mainline without inspiration');
assert.ok(build('person',{role:'反派',inspiration:premise})[0].goalMotivation.includes('具体立场与利益待确认'));
assert.equal(build('world',{category:'修炼境界',startRealm:'见微',endRealm:'归真'}).at(-1).title.includes('归真'),true);
assert.equal(build('outline',{volumes:4,chapters:6}).length,4);
assert.equal(build('volumeChapters',{structure:'五幕结构（弗莱塔格）',chapters:99}).length,5);
const reading = {title:'采样测试',chapters:Array.from({length:23},(_,i) => ({title:'章'+(i+1),body:'内容'+i}))};
assert.ok(build('bookAnalysis',{range:'均匀采样十章',dimensions:['文风']},{reading})[0].summary.includes('章23'));
assert.ok(build('bookAnalysis',{range:'前三章',dimensions:['文风']},{reading})[0].summary.includes('实际 3 章'));
assert.ok(!build('bookAnalysis',{range:'前三章',dimensions:['文风']},{reading})[0].summary.includes('章23'));
assert.ok(build('polish',{source:'保留我原来的文字'})[0].summary.startsWith('保留我原来的文字'));
assert.ok(build('test',{})[0].summary.includes('没有发送请求'));
assert.equal(build('tips',{source:'已有报告'}).length,5);
assert.ok(build('rewriteVolumes',{volumes:2},{resultStart:2})[0].title.startsWith('第2卷'));
assert.ok(build('rewriteChapters',{chapters:1,anchor:'第三章 · 山门之外'})[0].title.startsWith('第4章'));
for (const [id,spec] of Object.entries(context.window.previewAIOperations)) {
  const values = Object.fromEntries(spec.fields.map(field => [field.key,field.value ?? field.options?.[0] ?? field.checks ?? (field.number ? field.min : '示例内容')]));
  const output = build(id,values,{reading,writing:{title:'本章'}});
  assert.ok(output.length > 0 && output.every(item => item.title && item.summary),id + ' must return usable preview candidates');
}
console.log(JSON.stringify({ scriptsParsed: scripts.length + inline.length, uniqueIds: ids.length, views: 11, manuscriptAssertions: 7, aiAssertions:55, aiWorkflows:26, scope: 'standalone-preview' }));
