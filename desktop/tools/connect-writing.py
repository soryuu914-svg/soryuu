from pathlib import Path
root=Path(__file__).resolve().parents[2]
p=root/'docs/redesign/ios26-preview.html'
s=p.read_text(encoding='utf-8')
def rep(a,b):
    global s
    if b in s:return
    if s.count(a)!=1:raise RuntimeError(f'unique replacement needed: {a[:75]}')
    s=s.replace(a,b)
rep("      let currentChapterId = '3';", """      let currentChapterId = '3';
      const writingBooks = new Map(); let writingBookId='main';
      if(window.desktopStore){const saved=window.desktopStore.get('writing');(saved?.books || []).forEach(([id,value])=>writingBooks.set(id,value));Object.keys(chapters).forEach(id=>delete chapters[id]);Object.assign(chapters,writingBooks.get('main')?.chapters || {1:{title:'第一章',paragraphs:[]}});currentChapterId=writingBooks.get('main')?.currentChapterId || Object.keys(chapters)[0] || '1';}
""")
rep("active.firstChild.textContent = label", "if(!active)return; active.firstChild.textContent = label")
rep("Math.max(...Object.keys(chapters).map(Number)) + 1", "Math.max(0,...Object.keys(chapters).map(Number)) + 1")
rep("      const initialParams = new URLSearchParams(location.search)", """      if(window.desktopStore){
        const saved=window.desktopStore.get('writing');fontSize=saved?.fontSize || 18;bold=!!saved?.bold;italic=!!saved?.italic;serif=!!saved?.serif;
        const rebuildChapters=()=>{const list=document.querySelector('.chapter-items');list.replaceChildren();Object.entries(chapters).forEach(([id,chapter])=>{const button=document.createElement('button');button.type='button';button.className='chapter';button.dataset.chapter=id;button.setAttribute('aria-pressed',String(id===currentChapterId));button.append(document.createTextNode('第'+id+'章　'+chapter.title),document.createElement('span'));list.append(button);bindChapter(button);});const chapter=chapters[currentChapterId];$('chapter-input').value=chapter?.paragraphs.join('\\n\\n') || '';$('chapter-title').value=chapter?.title || '';applyType();updateCount();aiController?.renderSummary(chapter?.summary);};
        const writingExport=()=>{if(chapters[currentChapterId]){chapters[currentChapterId].paragraphs=$('chapter-input').value.split(/\\n\\n/);chapters[currentChapterId].title=$('chapter-title').value;}writingBooks.set(writingBookId,{chapters:JSON.parse(JSON.stringify(chapters)),currentChapterId});return {books:[...writingBooks],activeBookId:writingBookId,fontSize,bold,italic,serif};};
        window.desktopStore.register('writing',writingExport);
        window.addEventListener('desktop-book-changed',event=>{writingExport();writingBookId=event.detail.id;Object.keys(chapters).forEach(id=>delete chapters[id]);const saved=writingBooks.get(writingBookId);Object.assign(chapters,saved?.chapters || {1:{title:'第一章',paragraphs:[]}});currentChapterId=saved?.currentChapterId || Object.keys(chapters)[0];rebuildChapters();});
        window.workbench={books:bookController,pages:pageController,features:featureController,switchView,notice,getWritingChapters,writingBooks,writingExport,
          addChapter(title='新章节'){appendWritingChapters([{title,body:''}]);window.desktopStore.changed();},
          removeChapter(){if(Object.keys(chapters).length<=1)throw new Error('请保留至少一章。');delete chapters[currentChapterId];currentChapterId=Object.keys(chapters)[0];rebuildChapters();window.desktopStore.changed();},
          syncOutline(){const outlines=pageController.getAIContext('outline','章节细纲').items;let changed=false;outlines.forEach((outline,index)=>{const id=String(index+1);if(!chapters[id]){chapters[id]={title:outline.title,paragraphs:[],outlineId:outline.id};changed=true;}else if(!chapters[id].paragraphs.join('').trim() && !chapters[id].outlineId){chapters[id].title=outline.title;chapters[id].outlineId=outline.id;changed=true;}});if(changed)rebuildChapters();},
          allWritingBooks(){writingExport();return [...writingBooks];}
        };
        rebuildChapters();
      }
      const initialParams = new URLSearchParams(location.search)""")
rep("        if (view === 'editor') { growEditor();", "        if (view === 'editor') { window.workbench?.syncOutline();growEditor();")
rep("if (['bookhome','characters','world','outline','library'].includes(view)) pageController?.setBook();", "if (['bookhome','editor','characters','world','outline','cards','library'].includes(view)) pageController?.setBook();")
rep("        getDocuments: () => [", "        getDocuments: () => [\n          ...(window.desktopAllSearchDocuments?.() || []),")
rep("          switchView(result.view);\n          if (result.view === 'bookhome')", "          if(result.bookId && window.desktop){bookController.openBookHome(result.bookId);}switchView(result.view);\n          if (result.view === 'bookhome')")
p.write_text(s,encoding='utf-8')
print('Desktop writing hooks connected')
