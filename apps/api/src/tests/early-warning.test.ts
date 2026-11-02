import assert from 'node:assert/strict';
import test from 'node:test';
import { evaluateEarlyWarning } from '../lib/early-warning.js';

const response = { name:'Acknowledgement rate',direction:'higher' as const,greenLimit:90,redLimit:85,minValue:0,maxValue:100,unit:'%' };
const backlog = { name:'Overdue issues',direction:'lower' as const,greenLimit:20,redLimit:30,minValue:0,maxValue:100,unit:'' };

test('TC Pulse-style headroom warns before the higher-is-better threshold',()=>{
  const result=evaluateEarlyWarning({...response, values:[98,96,94,92]});
  assert.equal(result.band,'Green');
  assert.equal(result.severity,'Watch');
  assert.ok(result.signals.includes('HEADROOM'));
  assert.ok(result.projectedBreachPeriods!==null);
});
test('red band is critical for a breached rate',()=>{
  assert.equal(evaluateEarlyWarning({...response,values:[84]}).severity,'Critical');
});
test('a lower-is-better KPI uses increasing values as deterioration',()=>{
  const result=evaluateEarlyWarning({...backlog,values:[10,13,17,19]});
  assert.ok(result.signals.includes('HEADROOM'));
  assert.ok(result.projectedBreachPeriods!==null);
});
test('stable healthy readings do not produce a false warning',()=>{
  const result=evaluateEarlyWarning({...response,values:[98,98,98,98]});
  assert.equal(result.severity,'Healthy');
  assert.deepEqual(result.signals,[]);
});
test('less than three readings never create a trend estimate',()=>{
  assert.equal(evaluateEarlyWarning({...response,values:[96,94]}).slopePerPeriod,null);
});
test('invalid or out-of-range readings are rejected',()=>{
  assert.throws(()=>evaluateEarlyWarning({...response,values:[101]}));
  assert.throws(()=>evaluateEarlyWarning({...response,values:[]}));
});
