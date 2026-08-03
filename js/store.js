/* 端末内の保存。失敗しても動作は止めない（サンドボックス等では保存できない） */
const KEY = "apa-builder-v1";

export function saveState(state){
  try{ localStorage.setItem(KEY, JSON.stringify(state)); return true; }
  catch(e){ return false; }
}

export function loadState(){
  try{
    const raw = localStorage.getItem(KEY);
    if(!raw) return null;
    const s = JSON.parse(raw);
    return (s && typeof s === "object") ? s : null;
  }catch(e){ return null; }
}

export function clearState(){
  try{ localStorage.removeItem(KEY); }catch(e){}
}
