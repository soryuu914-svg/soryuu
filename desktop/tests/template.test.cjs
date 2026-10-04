const test=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs'),path=require('node:path');
test('initial template stays independent, latest follows edits, deletion preserves both after reload',()=>{
  const scope={window:{}};vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../../docs/redesign/preview-template-store.js'),'utf8'),scope);
  const store=scope.window.createPreviewTemplateStore(),book={id:'a',name:'甲书'};
  store.syncBook(book,[{id:'p',name:'张三',summary:'少年'}],{});
  store.syncBook(book,[{id:'p',name:'张三',summary:'掌门'}],{});
  assert.equal(store.list('characters','initial')[0].card.summary,'少年');
  assert.equal(store.list('characters','latest')[0].card.summary,'掌门');
  store.syncBook(book,[],{});
  const next=scope.window.createPreviewTemplateStore();next.restore(store.snapshot(),0);
  assert.equal(next.list('characters','initial')[0].card.summary,'少年');
  assert.equal(next.list('characters','latest')[0].linked,false);
});
