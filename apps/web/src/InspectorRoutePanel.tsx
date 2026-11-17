import { useEffect, useMemo, useRef, useState } from 'react';
import { AlertTriangle, Check, Clock3, MapPin, X } from 'lucide-react';
import type { Inspection } from './ground-inspections';
import {
  isValidRouteCoordinate, nearestNeighbour, routeByPriority,
  type RouteCandidate, type RouteCoordinate
} from './routeUtils';
import type { InspectorRouteMap } from './RealBlockMap';

type RouteStrategy = 'distance' | 'priority';
type OsrmRoute = { distance: number; duration: number; coordinates: RouteCoordinate[] };
const INSPECTOR_START: RouteCoordinate = [1.3521, 103.8198];

function parseOsrmRoute(value: unknown): OsrmRoute | null {
  if (!value || typeof value !== 'object') return null;
  const routes = (value as { routes?: unknown }).routes;
  if (!Array.isArray(routes) || !routes.length) return null;
  const route = routes[0];
  if (!route || typeof route !== 'object') return null;
  const distance = (route as { distance?: unknown }).distance;
  const duration = (route as { duration?: unknown }).duration;
  const geometry = (route as { geometry?: unknown }).geometry;
  if (typeof distance !== 'number' || !Number.isFinite(distance) || distance < 0 ||
      typeof duration !== 'number' || !Number.isFinite(duration) || duration < 0 ||
      !geometry || typeof geometry !== 'object') return null;
  const coordinates = (geometry as { coordinates?: unknown }).coordinates;
  if (!Array.isArray(coordinates) || coordinates.length < 2) return null;
  const leafletCoordinates: RouteCoordinate[] = [];
  for (const coordinate of coordinates) {
    if (!Array.isArray(coordinate) || coordinate.length < 2) return null;
    const [longitude, latitude] = coordinate;
    if (!isValidRouteCoordinate([latitude, longitude])) return null;
    leafletCoordinates.push([latitude, longitude]);
  }
  return { distance, duration, coordinates: leafletCoordinates };
}

export default function InspectorRoutePanel({
  inspections, candidates, open, onClose, onRouteChange
}: {
  inspections: Inspection[];
  candidates: RouteCandidate<Inspection>[];
  open: boolean;
  onClose: () => void;
  onRouteChange: (route: InspectorRouteMap | null) => void;
}) {
  const [strategy, setStrategy] = useState<RouteStrategy>('distance');
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set());
  const [visited, setVisited] = useState<Set<string>>(() => new Set());
  const [roadRoute, setRoadRoute] = useState<OsrmRoute | null>(null);
  const [loading, setLoading] = useState(false);
  const [routeError, setRouteError] = useState(false);
  const onRouteChangeRef = useRef(onRouteChange);
  onRouteChangeRef.current = onRouteChange;

  const selectedInspections = useMemo(() =>
    inspections.filter(item => selectedIds.has(item.id)), [inspections, selectedIds]);
  const candidateById = useMemo(() =>
    new Map(candidates.map(candidate => [candidate.inspection.id, candidate])), [candidates]);
  const routeCandidates = useMemo(() => selectedInspections.flatMap(inspection => {
    const candidate = candidateById.get(inspection.id);
    return candidate && isValidRouteCoordinate(candidate.coordinates) ? [candidate] : [];
  }), [selectedInspections, candidateById]);
  const invalidCoordinates = selectedInspections.filter(inspection => {
    const candidate = candidateById.get(inspection.id);
    return !candidate || !isValidRouteCoordinate(candidate.coordinates);
  });
  const ordered = useMemo(() => strategy === 'priority'
    ? routeByPriority(INSPECTOR_START, routeCandidates)
    : nearestNeighbour(INSPECTOR_START, routeCandidates), [routeCandidates, strategy]);
  const stopCoordinates = useMemo(() => ordered.map((candidate, index) => ({
    number: index + 1,
    coordinates: candidate.coordinates
  })), [ordered]);
  const fallbackPath = useMemo(() => [
    INSPECTOR_START,
    ...ordered.map(candidate => candidate.coordinates)
  ], [ordered]);

  useEffect(() => {
    if (!open) return;
    setRoadRoute(null);
    setRouteError(false);
    if (!ordered.length) {
      setLoading(false);
      onRouteChangeRef.current(null);
      return;
    }

    const controller = new AbortController();
    setLoading(true);
    onRouteChangeRef.current({ path: fallbackPath, roadBased: false, stops: stopCoordinates });
    const coordinates = [INSPECTOR_START, ...ordered.map(item => item.coordinates)]
      .map(([latitude, longitude]) => `${longitude},${latitude}`).join(';');
    const url = `https://router.project-osrm.org/route/v1/driving/${coordinates}?overview=full&geometries=geojson&steps=false`;
    fetch(url, { signal: controller.signal })
      .then(response => {
        if (!response.ok) throw new Error(`Routing service returned ${response.status}.`);
        return response.json() as Promise<unknown>;
      })
      .then(payload => {
        const route = parseOsrmRoute(payload);
        if (!route) throw new Error('The routing service returned an invalid route.');
        setRoadRoute(route);
        setLoading(false);
        onRouteChangeRef.current({
          path: route.coordinates, roadBased: true, stops: stopCoordinates
        });
      })
      .catch(() => {
        if (controller.signal.aborted) return;
        setRouteError(true);
        setLoading(false);
        onRouteChangeRef.current({ path: fallbackPath, roadBased: false, stops: stopCoordinates });
      });

    return () => controller.abort();
  }, [open, ordered, stopCoordinates, fallbackPath]);

  if (!open) return null;
  const visitedCount = selectedInspections.filter(item => visited.has(item.id)).length;
  return <section className="em-route-panel" aria-label="My Route">
    <header className="em-route-panel-header">
      <div><p className="eyebrow">FIELD INSPECTOR</p><h2>My Route</h2></div>
      <button type="button" onClick={onClose} aria-label="Close My Route"><X size={18}/></button>
    </header>
    <p className="em-route-disclaimer">
      Inspection records have no verified coordinates. This demo uses the Block Map's
      approximate fictional block pins, not surveyed locations.
    </p>

    <details className="em-route-selection" open>
      <summary>Select inspections ({selectedInspections.length} selected)</summary>
      <div className="em-route-selection-list">
        {inspections.map(inspection => <label key={inspection.id}>
          <input type="checkbox" checked={selectedIds.has(inspection.id)}
            aria-label={`Select ${inspection.category}, block ${inspection.block}, ${inspection.ref}`}
            onChange={() => setSelectedIds(current => {
              const next = new Set(current);
              if (next.has(inspection.id)) next.delete(inspection.id);
              else next.add(inspection.id);
              return next;
            })}/>
          <span className="em-route-selection-copy">
            <strong>{inspection.category} · Blk {inspection.block}</strong>
            <small>{inspection.ref} · {inspection.council}</small>
          </span>
          <span className={`em-route-tag priority-${inspection.priority.toLowerCase()}`}>{inspection.priority}</span>
          <span className="em-route-tag">{inspection.status}</span>
        </label>)}
      </div>
    </details>

    <label className="em-route-strategy">Routing strategy
      <select value={strategy} onChange={event => setStrategy(event.target.value as RouteStrategy)}>
        <option value="distance">Optimize for Distance</option>
        <option value="priority">Optimize for Priority</option>
      </select>
    </label>
    <p className="em-route-message">
      Nearest Neighbour is a route-planning heuristic; it does not guarantee the shortest route.
    </p>

    <div className="em-route-summary" aria-label="Route summary">
      <div><strong>{selectedInspections.length}</strong><span>Selected</span></div>
      <div><strong>{visitedCount}</strong><span>Visited</span></div>
      <div><strong>{roadRoute ? `${(roadRoute.distance / 1000).toFixed(1)} km` : '—'}</strong><span>Distance</span></div>
      <div><strong>{roadRoute ? `${Math.round(roadRoute.duration / 60)} min` : '—'}</strong><span>Duration</span></div>
    </div>

    {loading && <p className="em-route-message" role="status">Calculating road route…</p>}
    {routeError && <p className="em-route-warning" role="status">
      <AlertTriangle size={15}/> Road-based routing is temporarily unavailable; showing a dashed straight-line fallback. Distance and duration are not available.
    </p>}
    {!!invalidCoordinates.length && <p className="em-route-warning" role="status">
      <AlertTriangle size={15}/> {invalidCoordinates.length} selected inspection(s) have no valid map position and are excluded from routing.
    </p>}
    {!selectedInspections.length && <p className="em-route-message">
      Select one or more existing inspections above to plan your route.
    </p>}

    <ol className="em-route-stops">
      {ordered.map(({ inspection }, index) => {
        const isVisited = visited.has(inspection.id);
        return <li key={inspection.id} className={isVisited ? 'visited' : ''}>
          <span className="em-route-number">{index + 1}</span>
          <div className="em-route-stop-copy">
            <strong>{inspection.category} · Blk {inspection.block}</strong>
            <small>{inspection.ref} · {inspection.council}</small>
            <span className="em-route-tags">
              <span className={`em-route-tag priority-${inspection.priority.toLowerCase()}`}>{inspection.priority}</span>
              <span className="em-route-tag">{inspection.status}</span>
              {isVisited && <span className="em-route-tag visited-tag"><Check size={12}/> Visited</span>}
            </span>
          </div>
          <button type="button" className="em-route-visit" disabled={isVisited}
            onClick={() => setVisited(current => {
              if (current.has(inspection.id)) return current;
              return new Set(current).add(inspection.id);
            })}>
            {isVisited ? 'Visited' : 'Mark Visited'}
          </button>
        </li>;
      })}
      {invalidCoordinates.map(inspection => <li key={inspection.id} className="invalid">
        <span className="em-route-number">—</span>
        <div className="em-route-stop-copy">
          <strong>{inspection.category} · Blk {inspection.block}</strong>
          <small>{inspection.ref} · {inspection.council}</small>
          <span className="em-route-tags">
            <span className={`em-route-tag priority-${inspection.priority.toLowerCase()}`}>{inspection.priority}</span>
            <span className="em-route-tag">{inspection.status}</span>
            <span className="em-route-tag invalid-tag"><MapPin size={12}/> No valid location</span>
          </span>
        </div>
      </li>)}
    </ol>
    {roadRoute && <p className="em-route-message"><Clock3 size={14}/> Road distance and travel time are OSRM estimates.</p>}
  </section>;
}
