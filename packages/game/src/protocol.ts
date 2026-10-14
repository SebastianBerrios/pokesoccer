import type { Ball, Fighter, MatchState } from './types.ts';
export interface StatePatch {
  meta: Partial<Omit<MatchState,'players'|'ball'>>;
  players: (Partial<Fighter>&{id:string})[];
  ball: Partial<Ball>;
}
export function wireState(state:MatchState):MatchState {
  return JSON.parse(JSON.stringify(state, (key,value)=>{
    if(['seed','aiTimer','aiX','aiZ','passCredit'].includes(key))return 0;
    return typeof value==='number'?Math.round(value*1000)/1000:value;
  }));
}
function diff<T extends object>(before:T,after:T):Partial<T> {
  const result:Partial<T>={};
  for(const key of Object.keys(after) as (keyof T)[]) {
    if(typeof after[key]==='object'?JSON.stringify(before[key])!==JSON.stringify(after[key]):before[key]!==after[key])
      result[key]=after[key];
  }
  return result;
}
export function makePatch(before:MatchState,after:MatchState):StatePatch {
  const {players:bp,ball:bb,...bm}=before, {players:ap,ball:ab,...am}=after;
  return {meta:diff(bm,am),players:ap.map(p=>({id:p.id,...diff(bp.find(q=>q.id===p.id)??p,p)})).filter(p=>Object.keys(p).length>1),ball:diff(bb,ab)};
}
export function applyPatch(state:MatchState,patch:StatePatch):MatchState {
  Object.assign(state,patch.meta);Object.assign(state.ball,patch.ball);
  for(const p of patch.players){const target=state.players.find(q=>q.id===p.id);if(target)Object.assign(target,p);}
  return state;
}
