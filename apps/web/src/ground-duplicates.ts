/**
 * Advisory duplicate suggestions for feedback cases.
 * TC Pulse's same-council/same-block matching logic is adapted as a pure client-side rule.
 * Suggestions never block creating a case and never automatically merge records.
 */
export type DuplicateDraft = {
  townCouncilId:string; block:string; category:string;
  description:string; receivedAt:string;
};
export type DuplicateCandidate = {
  id:string; caseRef:string; townCouncilId:string; block:string;
  category:string; description:string|null; receivedAt:string;
};
export type DuplicateSuggestion<T extends DuplicateCandidate=DuplicateCandidate> = {
  item:T;strength:'Strong'|'Possible';similarity:number;
  daysApart:number;reason:string;
};
const stop=new Set(['the','and','for','with','from','that','this','there','have','has','was','were','are','not','but',
 'again','also','still','just','about','after','before','near','then','when','which','please','thanks','today','yesterday',
 'resident','residents','reported','report','case','feedback','complaint','block','blk','common']);
function words(text:string):Set<string>{
  return new Set(text.toLowerCase().split(/[^a-z0-9]+/g)
    .filter(w=>w.length>=3&&!stop.has(w)));
}
function similarity(a:string,b:string):number{
  const left=words(a),right=words(b);
  if(!left.size||!right.size)return 0;
  const intersect=[...left].filter(w=>right.has(w)).length;
  return intersect/(left.size+right.size-intersect);
}
export function suggestDuplicateCases<T extends DuplicateCandidate>(
  draft:DuplicateDraft,cases:readonly T[],excludeId?:string
):DuplicateSuggestion<T>[]{
  const receivedAt=Date.parse(draft.receivedAt);
  if(!draft.townCouncilId||!Number.isFinite(receivedAt)||!draft.description.trim())return [];
  const out:DuplicateSuggestion<T>[]=[];
  for(const item of cases){
    if(item.id===excludeId||item.townCouncilId!==draft.townCouncilId)continue;
    const days=Math.abs(receivedAt-Date.parse(item.receivedAt))/86_400_000;
    if(days>30)continue;
    const sameBlock=!!draft.block&&item.block.toUpperCase()===draft.block.trim().toUpperCase();
    const score=similarity(draft.description,item.description??'');
    let strength:'Strong'|'Possible'|null=null;
    if(sameBlock&&item.category===draft.category&&days<=7)strength='Strong';
    else if(sameBlock&&score>=0.4)strength='Possible';
    if(!strength)continue;
    const reason=strength==='Strong'?'Same council, block and category within 7 days':
      'Same council and block, with similar wording within 30 days';
    out.push({item,strength,similarity:Number(score.toFixed(2)),daysApart:Math.round(days),reason});
  }
  return out.sort((a,b)=>(a.strength==='Strong'?0:1)-(b.strength==='Strong'?0:1)||
    b.similarity-a.similarity||a.daysApart-b.daysApart).slice(0,5);
}
