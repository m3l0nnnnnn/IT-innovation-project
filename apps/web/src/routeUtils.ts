export type RouteCoordinate = [number, number];

export type RouteCandidate<T> = {
  inspection: T;
  coordinates: RouteCoordinate;
};

const priorityRank: Record<string, number> = { High: 0, Medium: 1, Low: 2 };

export function isValidRouteCoordinate(value: unknown): value is RouteCoordinate {
  if (!Array.isArray(value) || value.length !== 2) return false;
  const [latitude, longitude] = value;
  return typeof latitude === 'number' && Number.isFinite(latitude) &&
    latitude >= -90 && latitude <= 90 &&
    typeof longitude === 'number' && Number.isFinite(longitude) &&
    longitude >= -180 && longitude <= 180;
}

function distanceBetween(a: RouteCoordinate, b: RouteCoordinate): number {
  const radians = (degrees: number) => degrees * Math.PI / 180;
  const latitudeDelta = radians(b[0] - a[0]);
  const longitudeDelta = radians(b[1] - a[1]);
  const latitudeA = radians(a[0]);
  const latitudeB = radians(b[0]);
  const value = Math.sin(latitudeDelta / 2) ** 2 +
    Math.cos(latitudeA) * Math.cos(latitudeB) *
    Math.sin(longitudeDelta / 2) ** 2;
  return 2 * 6371 * Math.asin(Math.sqrt(value));
}

export function nearestNeighbour<T>(
  start: RouteCoordinate,
  candidates: RouteCandidate<T>[]
): RouteCandidate<T>[] {
  const remaining = [...candidates];
  const ordered: RouteCandidate<T>[] = [];
  let current = start;

  while (remaining.length) {
    let nearestIndex = 0;
    for (let index = 1; index < remaining.length; index++) {
      if (distanceBetween(current, remaining[index].coordinates) <
        distanceBetween(current, remaining[nearestIndex].coordinates)) {
        nearestIndex = index;
      }
    }
    const [next] = remaining.splice(nearestIndex, 1);
    ordered.push(next);
    current = next.coordinates;
  }
  return ordered;
}

export function routeByPriority<T extends { priority: string }>(
  start: RouteCoordinate,
  candidates: RouteCandidate<T>[]
): RouteCandidate<T>[] {
  const groups = new Map<string, RouteCandidate<T>[]>();
  for (const candidate of candidates) {
    const group = groups.get(candidate.inspection.priority) ?? [];
    group.push(candidate);
    groups.set(candidate.inspection.priority, group);
  }
  const priorities = [...groups.keys()].sort((a, b) =>
    (priorityRank[a] ?? Number.MAX_SAFE_INTEGER) -
    (priorityRank[b] ?? Number.MAX_SAFE_INTEGER));
  const ordered: RouteCandidate<T>[] = [];
  let current = start;
  for (const priority of priorities) {
    const group = nearestNeighbour(current, groups.get(priority) ?? []);
    ordered.push(...group);
    if (group.length) current = group[group.length - 1].coordinates;
  }
  return ordered;
}
