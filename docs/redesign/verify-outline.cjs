const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict'),path=require('node:path');
const context={window:{}};vm.createContext(context);vm.runInContext(fs.readFileSync(path.join(__dirname,'preview-ai.js'),'utf8'),context);
const build=context.window.buildPreviewAIResults,models=context.window.previewOutlineStructures;
let checks=0;for(const [name,nodes] of Object.entries(models)){
 const premise='主角获得识别承诺真假的能力，为了救回家人揭开试炼规则。';
 const vols=build('outline',{inspiration:premise,structure:name,volumes:2,chapters:999});
 assert.equal(vols.length,2);assert.ok(vols[0].summary.includes(premise));
 assert.equal(vols[0].fields.find(f=>f[0]==='章节数')[1],String(nodes.length));
 assert.equal(vols[0].fields.find(f=>f[0]==='章节计划')[1].split('\n').length,nodes.length);
 const chapters=build('volumeChapters',{structure:name,chapters:999,volumeOutline:'卷纲原文：试炼秘密',nodes:vols[0].fields.find(f=>f[0]==='章节计划')[1]},{resultStart:11,anchor:vols[0]});
 assert.equal(chapters.length,nodes.length);assert.ok(chapters[0].title.startsWith('第11章'));
 chapters.forEach((chapter,i)=>{assert.ok(chapter.summary.includes('卷纲原文：试炼秘密'));assert.equal(chapter.fields.find(f=>f[0]==='结构节点')[1],nodes[i]);});
 checks+=6+2*nodes.length;
}
assert.equal(models['七点结构法'].length,7);assert.equal(models['三幕式'].length,3);assert.equal(models['救猫咪十五节拍'].length,15);
assert.notDeepEqual(Array.from(models['七点结构法']),Array.from(models['特鲁比七步']));
for(const id of ['outline','rewriteVolumes']) assert.ok(context.window.previewAIOperations[id].fields.find(f=>f.key==='inspiration').readonly);
assert.ok(context.window.previewAIOperations.volumeChapters.fields.find(f=>f.key==='volumeOutline').readonly);
assert.ok(context.window.previewAIOperations.volumeChapters.fields.find(f=>f.key==='chapters').readonly);
console.log(JSON.stringify({models:Object.keys(models).length,assertions:checks+8,status:'PASS',scope:'local-preview-structure-and-source-contract'}));

const emotion=context.window.previewChapterEmotion;
const modes=['根据卷纲自动安排','期待与爽感','紧张与悬念','温暖与感动','压抑后释放'];
let emotionChecks=0;
for(const mode of modes){
 const rows=build('volumeChapters',{structure:'七点结构法',volumeOutline:'主角要救回家人',readerEmotion:mode});
 assert.equal(rows.length,7);assert.ok(rows[0].summary.includes('本章目标：'));assert.ok(rows[0].summary.includes('阻碍与行动：'));
 assert.ok(rows[6].summary.includes('不强行制造新危机'));assert.notEqual(rows[0].fields.find(f=>f[0]==='读者情绪')[1],rows[6].fields.find(f=>f[0]==='读者情绪')[1]);
 const rewritten=build('chapterOutline',{structure:'七点结构法',readerEmotion:mode,volumeOutline:'卷纲原文'}, {anchor:{fields:[['节点序号','7']]}});
 assert.equal(rewritten[0].fields.find(f=>f[0]==='读者情绪')[1],rows[6].fields.find(f=>f[0]==='读者情绪')[1]);
 emotionChecks+=6;
}
assert.notEqual(emotion('温暖与感动',2,7).curve,emotion('紧张与悬念',2,7).curve);
assert.ok(context.window.previewAIOperations.volumeChapters.fields.find(f=>f.key==='readerEmotion'));
console.log(JSON.stringify({emotionAssertions:emotionChecks+2,status:'PASS'}));
