import { useState } from 'react';
import { Bot, MessageSquareText, Send, ShieldAlert, Sparkles } from 'lucide-react';
import { COUNCILS, METRICS, series, riskRecords, getActions,
  useStudioVersion, type RiskRecord } from './studio-data';
import './studio-pages.css';

type Intent='summary'|'risk'|'trend'|'actions';
const questions:{intent:Intent;text:string}[]=[
  {intent:'summary',text:'Summarise the current Town Council performance'},
  {intent:'risk',text:'Which indicators need attention?'},
  {intent:'trend',text:'What has changed in the latest months?'},
  {intent:'actions',text:'Which corrective actions are pending?'}
];
type Message={kind:'user'|'assistant';text:string};
function describeRisks(risks:RiskRecord[]){
  const active=risks.filter(r=>r.level!=='Healthy');
  if(!active.length)return 'The selected scope has no threshold concerns under the current fictional rules.';
  return active.slice(0,6).map(r=>'- '+r.council+' / '+r.metric.name+': '+r.level+
    ' (latest '+r.current+r.metric.unit+', threshold '+r.metric.threshold+r.metric.unit+')').join('\n');
}
function answer(intent:Intent,councilId:string):string{
  const councils=COUNCILS.filter(c=>!councilId||c.id===councilId);
  const risks=riskRecords(councilId);
  if(intent==='risk')return 'Deterministic risk summary (fictional):\n'+describeRisks(risks);
  if(intent==='actions'){
    const actions=getActions().filter(a=>(!councilId||a.councilId===councilId)&&a.status!=='Completed');
    return actions.length?'Open actions in the current demonstration:\n'+actions.slice(0,8).map(a=>
      '- '+a.title+' — '+a.owner+', due '+a.due+' ('+a.status+')').join('\n'):'No open corrective actions in this fictional scope.';
  }
  if(intent==='trend'){
    const lines=councils.flatMap(c=>METRICS.filter(m=>m.id==='response'||m.id==='management').map(m=>{
      const p=series(c.id,m.id),latest=p.at(-1)?.value??0,previous=p.at(-4)?.value??latest;
      return '- '+c.name+' / '+m.name+': '+latest.toFixed(1)+m.unit+' ('+
        (latest-previous>=0?'+':'')+(latest-previous).toFixed(1)+' vs three months earlier)';
    }));
    return 'Changes in synthetic readings:\n'+lines.join('\n')+'\nThese are observations, not causal explanations.';
  }
  return 'Performance snapshot (fictional):\n'+councils.map(c=>
    '- '+c.name+': management score '+(series(c.id,'management').at(-1)?.value??0).toFixed(1)+
    '/100; '+risks.filter(r=>r.councilId===c.id&&r.level!=='Healthy').length+' illustrative risks'
  ).join('\n')+'\nFor further detail, open Performance Analytics or Early Warnings.';
}
export default function StudioAssistant(){
  useStudioVersion();
  const [councilId,setCouncilId]=useState('');
  const [messages,setMessages]=useState<Message[]>([
    {kind:'assistant',text:'Choose a suggested question below. This demo explains fictional KPI data using fixed rules; it is not connected to an AI model.'}
  ]);
  function send(intent:Intent){
    const prompt=questions.find(q=>q.intent===intent)!;
    setMessages(current=>[...current,
      {kind:'user',text:prompt.text},
      {kind:'assistant',text:answer(intent,councilId)}
    ]);
  }
  return <section className="sp-page">
    <header className="page-header"><div><p className="eyebrow">MANAGEMENT INSIGHTS · DEMO ASSISTANT</p>
      <h1>Insights assistant</h1>
      <p className="subtext">Explore consistent, rule-based explanations of the fictional management and early-warning data.</p>
    </div></header>
    <div className="sp-notice"><ShieldAlert size={17}/> The prototype does not call an LLM, search the web or process any real EMS information. Responses are generated from fixed, inspectable rules.</div>
    <div className="sp-toolbar card"><label>Demo scope<select value={councilId} onChange={e=>setCouncilId(e.target.value)}>
      <option value="">All demonstration councils</option>{COUNCILS.map(c=><option key={c.id} value={c.id}>{c.name}</option>)}
    </select></label><span className="sp-tag">Rules-based preview</span></div>
    <div className="card sp-chat">
      <div className="sp-chat-header"><div className="sp-chat-symbol"><Bot size={21}/></div>
        <div><strong>Estara Insights</strong><small>Simulated data · No external AI connection</small></div></div>
      <div className="sp-messages" aria-live="polite">{messages.map((m,i)=><div key={i} className={'sp-message '+m.kind}>
        {m.kind==='assistant'&&<Sparkles size={16}/>}<p>{m.text}</p></div>)}</div>
      <div className="sp-question-grid">{questions.map(q=><button key={q.intent} className="sp-secondary" onClick={()=>send(q.intent)}>
        <MessageSquareText size={16}/>{q.text}</button>)}</div>
      <div className="sp-chat-footer"><Send size={15}/> Select a prompt to receive a deterministic demo response. Unrestricted chat is not enabled.</div>
    </div>
    <p className="sp-footnote">Production AI would require explicit data approval, access controls, prompt-injection defences, source grounding, auditability and testing.</p>
  </section>;
}
