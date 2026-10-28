// All data in this file is FICTIONAL demonstration data.
export const cases = [
  {id:'FB-1041', council:'North District (demo)', location:'Block 210', category:'Lift', received:'2026-10-20', status:'Open', officer:'Officer A'},
  {id:'FB-1042', council:'North District (demo)', location:'Block 212', category:'Cleanliness', received:'2026-10-21', status:'Open', officer:'Officer B'},
  {id:'FB-1043', council:'Central District (demo)', location:'Block 88', category:'Lighting', received:'2026-10-19', status:'Closed', officer:'Officer C'},
  {id:'FB-1044', council:'East District (demo)', location:'Block 301', category:'Pests', received:'2026-10-18', status:'Open', officer:'Officer D'},
  {id:'FB-1045', council:'Central District (demo)', location:'Block 94', category:'Lift', received:'2026-10-17', status:'Closed', officer:'Officer A'},
  {id:'FB-1046', council:'East District (demo)', location:'Block 309', category:'Cleanliness', received:'2026-10-23', status:'Open', officer:'Officer E'}
];
export const kpis = [
  {id:'K1', name:'Feedback response rate', unit:'%', value:91, target:90, trend:-5, points:[97,96,95,93,92,91]},
  {id:'K2', name:'Case closure rate', unit:'%', value:87, target:85, trend:2, points:[78,80,82,84,85,87]},
  {id:'K3', name:'Outstanding cases', unit:'', value:24, target:20, trend:4, points:[12,14,16,19,20,24]},
  {id:'K4', name:'Acknowledged on time', unit:'%', value:94, target:90, trend:-2, points:[98,97,97,96,95,94]}
];
export const alerts = [
  {id:'AL-201', council:'North District (demo)', title:'Response rate approaching target', severity:'Warning', status:'New', reason:'Response rate fell for three reporting periods and is 1 percentage point above target.', date:'2026-10-28'},
  {id:'AL-202', council:'East District (demo)', title:'Outstanding case count above demo target', severity:'Critical', status:'Acknowledged', reason:'24 outstanding cases against an illustrative threshold of 20.', date:'2026-10-27'},
  {id:'AL-203', council:'Central District (demo)', title:'Repeated lift feedback', severity:'Watch', status:'New', reason:'Several reports reference similar lift issues. Review linked cases.', date:'2026-10-26'},
  {id:'AL-204', council:'North District (demo)', title:'Closure trend improving', severity:'Watch', status:'Resolved', reason:'Resolved demonstration alert retained in history.', date:'2026-10-24'}
];
export const actions = [
  {id:'CA-301', title:'Review overdue feedback assignments', owner:'Estate Officer A', council:'East District (demo)', priority:'High', status:'In Progress', due:'2026-11-02', alertId:'AL-202'},
  {id:'CA-302', title:'Follow up on lift issue reports', owner:'Estate Officer B', council:'Central District (demo)', priority:'Medium', status:'Planned', due:'2026-11-05', alertId:'AL-203'},
  {id:'CA-303', title:'Rebalance case response workload', owner:'Estate Officer C', council:'North District (demo)', priority:'High', status:'Pending Review', due:'2026-10-31', alertId:'AL-201'}
];
export const scores = [
  {council:'North District (demo)', period:'October 2026', score:91, change:-3},
  {council:'Central District (demo)', period:'October 2026', score:95, change:2},
  {council:'East District (demo)', period:'October 2026', score:88, change:-4}
];
