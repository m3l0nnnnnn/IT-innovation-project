import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { cases, kpis, alerts, actions, scores } from './demo.js';

const app = express();
app.disable('x-powered-by');
app.use(helmet());
app.use(cors({origin:process.env.WEB_ORIGIN ?? 'http://localhost:5173'}));
app.use(express.json({limit:'1mb'}));

app.get('/api/health', (_req,res) => res.json({status:'ok', app:'Estara', mode:'demo'}));
app.get('/api/overview', (_req,res) => res.json({
  demo:true,
  summary:{councils:3, activeAlerts:alerts.filter(a => a.status !== 'Resolved').length, openCases:cases.filter(c => c.status === 'Open').length, activeActions:actions.filter(a => a.status !== 'Completed').length},
  kpis, alerts:alerts.slice(0,3), scores
}));
app.get('/api/cases', (_req,res) => res.json({demo:true,data:cases}));
app.get('/api/kpis', (_req,res) => res.json({demo:true,data:kpis}));
app.get('/api/alerts', (_req,res) => res.json({demo:true,data:alerts}));
app.get('/api/actions', (_req,res) => res.json({demo:true,data:actions}));
app.get('/api/reports', (_req,res) => res.json({demo:true,data:scores}));
app.all('/api/auth/*path', (_req,res) => res.status(501).json({message:'Authentication not implemented in demo.'}));
app.all('/api/ai/*path', (_req,res) => res.status(501).json({message:'AI assistant not connected. Do not upload EMS data.'}));
app.use('/api', (_req,res) => res.status(404).json({message:'API route not found.'}));

const port = Number(process.env.PORT ?? 4000);
app.listen(port, () => console.log('Estara demo API listening at http://localhost:' + port));
