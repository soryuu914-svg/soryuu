/* Independent chapter-to-outline association for the existing workbench. */
(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.desktopChapterLinks=api;})(typeof window==='object'?window:globalThis,()=>{
  function number(title){
    const token=/第([0-9零〇一二三四五六七八九十百千万两]+)章/.exec(title || '')?.[1];
    if(!token)return 0;if(/^\d+$/.test(token))return Number(token);
    const digits={零:0,〇:0,一:1,二:2,两:2,三:3,四:4,五:5,六:6,七:7,八:8,九:9},units={十:10,百:100,千:1000};
    let total=0,part=0,value=0;
    for(const char of token){if(char==='万'){total+=(part+value)*10000;part=value=0;}else if(units[char]){part+=(value||1)*units[char];value=0;}else value=digits[char];}
    return total+part+value;
  }
  function sync(chapters,outlines){
    let changed=false;
    for(let index=0;index<outlines.length;index++){
      const outline=outlines[index];
      let entry=Object.entries(chapters).find(([,chapter])=>chapter.outlineId===outline.id);
      if(!entry){let id=String(number(outline.title)||index+1);if(chapters[id]?.outlineId && chapters[id].outlineId!==outline.id)id=String(Math.max(0,...Object.keys(chapters).map(Number))+1);
        if(!chapters[id])chapters[id]={title:outline.title,paragraphs:[]};
        chapters[id].outlineId=outline.id;entry=[id,chapters[id]];changed=true;
      }
      const chapter=entry[1];if(!chapter.paragraphs.join('').trim() && chapter.title!==outline.title){chapter.title=outline.title;changed=true;}
    }
    return changed;
  }
  function resolve(chapter,outlines){
    if(chapter.outlineId)return outlines.find(outline=>outline.id===chapter.outlineId);
    return outlines.find(outline=>number(outline.title)===Number(chapter.id)) || outlines.find(outline=>chapter.title && outline.title.includes(chapter.title));
  }
  return {number,sync,resolve};
});
