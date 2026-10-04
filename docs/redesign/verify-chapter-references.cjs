const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const ctx={window:{}};vm.createContext(ctx);
for(const name of ['preview-chapter-references.js','preview-ai.js'])vm.runInContext(fs.readFileSync(__dirname+'/'+name,'utf8'),ctx);
const story={people:[{id:'a',name:'张三',summary:'为救家人入宗',goalMotivation:'救回家人'},{id:'b',name:'李四',summary:'守护山门'},{id:'c',name:'王五',summary:'未选择'}],world:[{id:'w',title:'青云宗',summary:'南域宗门',currentState:'已封闭山门'},{id:'x',title:'黑水盟',summary:'未选择'}]};
const refs=ctx.window.previewResolveChapterReferences({people:['a','b'],world:['w']},story);
assert.equal(refs.people.length,2);assert.equal(refs.world.length,1);assert.equal(refs.missing.length,0);
const missing=ctx.window.previewResolveChapterReferences({people:['deleted'],world:[]},story);assert.equal(missing.missing[0],'deleted');
for(const op of ['full','continue','polish','expand']){
const output=ctx.window.buildPreviewAIResults(op,{source:'作者原文'}, {chapterSelection:refs,chapterOutline:{summary:'主角入宗接受考核，不能提前决战'}})[0].summary;
for(const text of ['张三','李四','青云宗','已封闭山门','救回家人','主角入宗接受考核，不能提前决战'])assert.ok(output.includes(text));
for(const text of ['王五','黑水盟'])assert.ok(!output.includes(text));
if(['polish','expand'].includes(op))assert.ok(output.startsWith('作者原文'));
}
assert.ok(ctx.window.previewAIOperations.full.fields.find(f=>f.key==='outline').readonly);
console.log(JSON.stringify({status:'PASS',assertions:39,scope:'selected-cards-and-outline-input-preview'}));
