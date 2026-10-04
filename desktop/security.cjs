function sameDocument(input,entry){try{const current=new URL(input),allowed=new URL(entry);current.search='';current.hash='';allowed.search='';allowed.hash='';return current.href===allowed.href;}catch{return false;}}
module.exports={sameDocument};
