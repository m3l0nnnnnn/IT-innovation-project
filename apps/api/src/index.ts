import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { ZodError } from 'zod';
import { cases, kpis, alerts, actions, scores } from './demo.js';
import { casesRouter } from './routes/cases.js';
import { caseImportRouter } from './routes/case-import.js';
import { kpisRouter } from './routes/kpis.js';

const app = express();
app.disable('x-powered-by');
app.use(helmet());
app.use(cors({origin:process.env.WEB_ORIGIN ?? 'http://localhost:5173'}));
// Before the JSON parser: imports bring their own body parsers with larger limits.
app.use('/api/cases/import', caseImportRouter);
app.use(express.json({limit:'1mb'}));

app.get('/api/health', (_req,res) => res.json({status:'ok', app:'Estara', mode:'demo'}));
app.get('/api/overview', (_req,res) => res.json({
  demo:true,
  summary:{councils:3, activeAlerts:alerts.filter(a => a.status !== 'Resolved').length, openCases:cases.filter(c => c.status === 'Open').length, activeActions:actions.filter(a => a.status !== 'Completed').length},
  kpis, alerts:alerts.slice(0,3), scores
}));
app.use('/api/cases', casesRouter);
app.use('/api/kpis', kpisRouter);
// The legacy starter page's fictional KPI list (not in the navigation).
app.get('/api/demo/kpis', (_req,res) => res.json({demo:true,data:kpis}));
app.get('/api/alerts', (_req,res) => res.json({demo:true,data:alerts}));
app.get('/api/actions', (_req,res) => res.json({demo:true,data:actions}));
app.get('/api/reports', (_req,res) => res.json({demo:true,data:scores}));
app.all('/api/auth/*path', (_req,res) => res.status(501).json({message:'Authentication not implemented in demo.'}));
app.all('/api/ai/*path', (_req,res) => res.status(501).json({message:'AI assistant not connected. Do not upload EMS data.'}));
app.use('/api', (_req,res) => res.status(404).json({message:'API route not found.'}));

// Turns validation and database errors into clear responses instead of a generic 500.
app.use((err: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  if (err instanceof ZodError) return void res.status(400).json({message:'Invalid request.', issues:err.issues.map(i => ({path:i.path.join('.'), message:i.message}))});
  if ((err as {type?:string}).type === 'entity.too.large') return void res.status(413).json({message:'The upload is too large. Split the file into smaller files.'});
  const code = (err as {code?:string}).code ?? (err as {cause?:{code?:string}}).cause?.code;
  if (code === '23503') return void res.status(400).json({message:'A referenced record does not exist.'});
  if (code === '23505') return void res.status(409).json({message:'A record with the same unique value already exists. Please retry.'});
  if (code === '22P02') return void res.status(400).json({message:'Invalid value in request.'});
  if (code === 'ECONNREFUSED' || code === 'ENOTFOUND') return void res.status(503).json({message:'Database unavailable. Check apps/api/.env (see apps/api/.env.example).'});
  // Wrong password in DATABASE_URL; after many failures Supabase's pooler blocks new logins for a few minutes.
  const text = err instanceof Error ? err.message : '';
  if (code === '28P01' || text.includes('ECIRCUITBREAKER')) return void res.status(503).json({message: text.includes('ECIRCUITBREAKER')
    ? 'Database login temporarily blocked after too many failed password attempts. Fix the password in apps/api/.env, wait a few minutes, then restart the API.'
    : 'Database password rejected. Check the password in DATABASE_URL in apps/api/.env, then restart the API.'});
  // A table the code expects does not exist yet: the database needs the latest migrations.
  if (code === '42P01') return void res.status(503).json({message:'The database is missing tables. Run npm run db:migrate (and npm run db:seed-kpis for the KPI module).'});
  console.error(err);
  res.status(500).json({message:'Something went wrong on the server.'});
});

const port = Number(process.env.PORT ?? 4000);
app.listen(port, () => console.log('Estara demo API listening at http://localhost:' + port));
