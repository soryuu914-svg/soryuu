/* In-memory archive for the standalone preview. Source deletion never cascades. */
(() => {
  const clone = value => JSON.parse(JSON.stringify(value));
  window.createPreviewTemplateStore = () => {
    let entries = [], revision = 0;
    return {
      syncBook(book, people, worldGroups) {
        const before = JSON.stringify(entries), live = new Set();
        const upsert = (type, card, group) => {
          const id = JSON.stringify([type,book.id,card.id]); live.add(id);
          const saved = {id,type,bookId:book.id,bookName:book.name,sourceId:card.id,sourceGroup:group,linked:true,card:clone(card)};
          const index = entries.findIndex(item => item.id === id);
          if (index < 0) entries.unshift({...saved,initialCard:clone(card),initialOrigin:'created'});
          else entries[index] = {...saved,initialCard:clone(entries[index].initialCard || entries[index].card),initialOrigin:entries[index].initialOrigin || 'first-recoverable'};
        };
        people.forEach(card => upsert('characters',card,'人物卡'));
        Object.entries(worldGroups).forEach(([group,cards]) => cards.forEach(card => upsert('world',card,group)));
        entries.forEach(item => { if (item.bookId === book.id && !live.has(item.id)) item.linked = false; });
        if (JSON.stringify(entries) !== before) revision++;
      },
      list(type, version='latest') { return clone(entries.filter(item => item.type === type).map(item=>({...item,version,card:version==='initial' ? item.initialCard || item.card : item.card}))); },
      snapshot() { return {entries:clone(entries),revision}; },
      restore(snapshot, expectedRevision) { if (revision !== expectedRevision) return false; entries = clone(snapshot.entries); revision++; return true; },
      get revision() { return revision; }
    };
  };
})();
