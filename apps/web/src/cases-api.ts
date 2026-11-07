import axios from 'axios';

/** Client for the feedback case API (apps/api/src/routes/cases.ts), backed by Supabase. */
export type CaseStatus = 'Open' | 'Closed';
export type CaseItem = {
  id:string; caseRef:string; townCouncilId:string; council:string;
  block:string; street:string|null; postalCode:string|null; location:string|null;
  category:string; channel:string; description:string|null; status:CaseStatus;
  assignedOfficer:string|null; duplicateOfId:string|null; duplicateOfRef:string|null;
  receivedAt:string; acknowledgedAt:string|null; closedAt:string|null; updatedAt:string;
  duplicates?:{id:string;caseRef:string;status:CaseStatus;receivedAt:string}[];
};
export type CaseInput = Pick<CaseItem,
  'townCouncilId'|'block'|'street'|'postalCode'|'location'|'category'|
  'channel'|'description'|'assignedOfficer'|'receivedAt'>;
export type CasePatch = Partial<CaseInput>&{
  status?:CaseStatus;acknowledgedAt?:string|null;closedAt?:string|null;
};
export type CaseMeta = {
  councils:{id:string;name:string}[];categories:string[];channels:string[];statuses:CaseStatus[];
};
export type CaseList = {data:CaseItem[];total:number;page:number;pageSize:number};
export type CaseSummary = {
  data:{total:number;open:number;closed:number;overdue:number;unacknowledged:number};
  overdueAfterDays:number;
};

const api=axios.create({baseURL:'/api/cases'});

export async function getCaseMeta(){return (await api.get<CaseMeta>('/meta')).data;}
export async function getCaseSummary(townCouncilId:string){
  return (await api.get<CaseSummary>('/summary',{params:townCouncilId?{townCouncilId}:{}})).data;
}
export async function listCases(params:URLSearchParams){return (await api.get<CaseList>('/',{params})).data;}
export async function getCase(idOrRef:string){
  return (await api.get<{data:CaseItem}>('/'+encodeURIComponent(idOrRef))).data.data;
}
export async function createCase(input:CaseInput){return (await api.post<{data:CaseItem}>('/',input)).data.data;}
export async function patchCase(idOrRef:string,changes:CasePatch){
  return (await api.patch<{data:CaseItem}>('/'+encodeURIComponent(idOrRef),changes)).data.data;
}

/** Turns an API error into a message for the user, including the first validation issue if there is one. */
export function apiErrorMessage(error:unknown):string{
  if(axios.isAxiosError(error)){
    const body=error.response?.data as {message?:string;issues?:{path:string;message:string}[]}|undefined;
    const issue=body?.issues?.[0];
    if(issue)return (issue.path?issue.path+': ':'')+issue.message;
    if(body?.message)return body.message;
    // No response, or the Vite proxy's empty 5xx when nothing is listening on port 4000.
    if(!error.response||error.response.status>=500)return 'Cannot reach the API. Is it running on port 4000 (npm run dev)?';
  }
  return error instanceof Error?error.message:'An unexpected error occurred.';
}
