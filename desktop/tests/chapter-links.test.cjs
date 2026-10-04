const test=require('node:test'),assert=require('node:assert/strict'),links=require('../chapter-links.js');
test('later-volume outlines keep chapter numbers and never overwrite written body',()=>{
  const chapters={8:{title:'作者自定标题',paragraphs:['不能覆盖的原稿']}};
  const outlines=[{id:'outline-a',title:'第8章 山门'},{id:'outline-b',title:'第9章 新路'}];
  assert.equal(links.sync(chapters,outlines),true);assert.equal(chapters[8].outlineId,'outline-a');assert.deepEqual(chapters[8].paragraphs,['不能覆盖的原稿']);assert.equal(chapters[8].title,'作者自定标题');assert.equal(chapters[9].outlineId,'outline-b');
  outlines.reverse();outlines.find(x=>x.id==='outline-a').title='第10章 修改章名';links.sync(chapters,outlines);
  assert.equal(links.resolve({id:'8',...chapters[8]},outlines).id,'outline-a');assert.equal(Object.keys(chapters).length,2);
});
test('deleted association cannot silently bind to another outline with the same number',()=>{
  assert.equal(links.resolve({id:'8',outlineId:'removed'},[{id:'different',title:'第8章'}]),undefined);
  assert.equal(links.number('第一百零二章 归途'),102);assert.equal(links.number('第两百一十章'),210);assert.equal(links.number('第1000章'),1000);
});
