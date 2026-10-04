const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const context={window:{}};vm.createContext(context);
for(const file of ['preview-zhihu-writing.js','preview-quality.js'])vm.runInContext(fs.readFileSync(__dirname+'/'+file,'utf8'),context);
const data=context.window.previewZhihuWriting,model=context.window.previewQualityModel;
const archive=JSON.parse(fs.readFileSync(__dirname+'/../research/zhihu-writing/sources-200.json','utf8'));
assert.equal(archive.sources.length,200);assert.equal(new Set(archive.sources.map(s=>s.canonicalUrl)).size,200);
const sources=new Map(archive.sources.map(s=>[s.sourceId,s.canonicalUrl]));
JSON.parse(fs.readFileSync(__dirname+'/../research/zhihu-writing/expanded/source-index.json','utf8')).forEach((s,i)=>sources.set('EXP-'+String(i+1).padStart(3,'0'),s.Url.split('?')[0]));
const cards=Object.values(data).flat();assert.equal(cards.length,54);assert.equal(new Set(cards.map(c=>c.id)).size,54);
for(const c of cards){const f=new Map(c.fields);assert.ok(f.get('适用场景'));assert.ok(f.get('例外'));assert.ok(model.materialText(c).includes(f.get('例外')));assert.ok(c.researchSource.scope.includes('excerpts'));for(const s of c.researchSource.sources)assert.equal(s.url,sources.get(s.id));}
const selection=model.selectMaterials(data['写作技巧'],{operation:'full',genre:'修仙',text:'试炼 山门 同伴 选择 金手指 宗门 目标 规则 伏笔'});
assert.ok(selection.length<=4 && selection.length>1);assert.ok(!selection.some(s=>new Map(s.fields).get('适用题材')==='灵异'));
assert.equal(model.selectMaterials(data['写作技巧'],{operation:'full',genre:'都市'}).length,1);
assert.equal(model.selectMaterials(data['写作技巧'],{operation:'summary',genre:'修仙',text:'选择'}).length,0);
const custom={id:'custom',summary:'自己的建议',fields:[]};assert.ok(model.selectMaterials([custom,...data['写作技巧']],{operation:'full',genre:'都市',text:'选择'}).includes(custom));
console.log('PASS: 200 initial sources plus expansion, 54 conditional cards, attribution, genre/operation filtering, 4-card research cap and custom preservation');
