import { Readable } from 'node:stream';
import ExcelJS from 'exceljs';
import { z } from 'zod';
import { caseCategories, caseChannels, caseStatuses } from '../db/schema.js';
import { createCaseBody, resolveCaseDates } from './cases.js';

// Excel/CSV import of feedback cases: read the file, check every row with the same rules as the case form,
// and flag rows that look like repeats. Nothing here touches the database; routes/case-import.ts does that.

export const MAX_IMPORT_ROWS = 2000;
export const DUPLICATE_WINDOW_DAYS = 7;
const DAY_MS = 86_400_000;
// Spreadsheet dates have no time zone; EMS works in Singapore time (UTC+8, no daylight saving).
const SGT_OFFSET_MS = 8 * 3_600_000;

export const importColumns = [
  { key: 'council', header: 'Town Council', aliases: ['council', 'tc'], required: true },
  { key: 'block', header: 'Block', aliases: ['blk', 'blockno', 'blocknumber'], required: true },
  { key: 'street', header: 'Street', aliases: ['streetname'] },
  { key: 'postalCode', header: 'Postal Code', aliases: ['postal', 'postcode'] },
  { key: 'location', header: 'Location', aliases: ['specificlocation'] },
  { key: 'category', header: 'Category', aliases: [], required: true },
  { key: 'channel', header: 'Channel', aliases: [], required: true },
  { key: 'description', header: 'Description', aliases: ['feedback', 'details'] },
  { key: 'status', header: 'Status', aliases: [] },
  { key: 'assignedOfficer', header: 'Assigned Officer', aliases: ['officer'] },
  { key: 'receivedAt', header: 'Received At', aliases: ['received', 'datereceived', 'receiveddate'], required: true },
  { key: 'acknowledgedAt', header: 'Acknowledged At', aliases: ['acknowledged', 'dateacknowledged'] },
  { key: 'closedAt', header: 'Closed At', aliases: ['closed', 'dateclosed'] }
] as const;
type ColumnKey = typeof importColumns[number]['key'];
const headerOf = Object.fromEntries(importColumns.map(c => [c.key, c.header])) as Record<ColumnKey, string>;

export type RawValue = string | number | Date | null;
export type RawRow = { rowNumber: number; cells: Partial<Record<ColumnKey, RawValue>> };
export type ImportCase = z.infer<typeof importCaseBody>;
export type PreviewRow = {
  rowNumber: number;
  result: 'ready' | 'duplicate' | 'error';
  messages: string[];
  council: string | null; block: string | null; category: string | null;
  receivedAt: string | null; description: string | null;
  value?: ImportCase;
};
export type ExistingCase = { caseRef: string; townCouncilId: string; block: string; category: string; receivedAt: Date };

/** A problem with the file as a whole (wrong format, missing columns, too many rows). */
export class ImportFileError extends Error {}

/** Body of one case in the confirm step: the case form's rules, without linking duplicates. */
export const importCaseBody = createCaseBody.omit({ duplicateOfId: true });
export const importCommitBody = z.strictObject({ rows: z.array(importCaseBody).min(1).max(MAX_IMPORT_ROWS) });

const squash = (text: string) => text.toLowerCase().replace(/[^a-z0-9]/g, '');

/** Reads the first worksheet of an .xlsx file, or a CSV file, into raw rows keyed by column. */
export async function readCaseFile(file: Buffer): Promise<RawRow[]> {
  const workbook = new ExcelJS.Workbook();
  try {
    if (file.subarray(0, 4).toString('hex') === 'd0cf11e0') throw new ImportFileError('Old .xls files are not supported. Save the file as .xlsx or .csv and try again.');
    if (file.subarray(0, 2).toString() === 'PK') {
      await workbook.xlsx.load(file as unknown as ExcelJS.Buffer);
    } else {
      // Keep every CSV value as text so postal codes keep their leading zeros and dates are parsed below.
      await workbook.csv.read(Readable.from([file]), { map: (value: unknown) => value });
    }
  } catch (error) {
    if (error instanceof ImportFileError) throw error;
    throw new ImportFileError('Could not read the file. Upload an .xlsx or .csv file based on the import template.');
  }
  const sheet = workbook.worksheets[0];
  if (!sheet || sheet.actualRowCount < 2) throw new ImportFileError('The file has no case rows. Put the column headings in row 1 and one case per row below.');

  const columnOf = new Map<ColumnKey, number>();
  sheet.getRow(1).eachCell((cell, col) => {
    const heading = squash(String(toRaw(cell.value) ?? ''));
    const column = importColumns.find(c => squash(c.header) === heading || (c.aliases as readonly string[]).includes(heading));
    if (column && !columnOf.has(column.key)) columnOf.set(column.key, col);
  });
  const missing = importColumns.filter(c => 'required' in c && !columnOf.has(c.key)).map(c => c.header);
  if (missing.length) throw new ImportFileError('Missing column(s): ' + missing.join(', ') + '. Download the template to see the expected headings.');

  const rows: RawRow[] = [];
  sheet.eachRow((row, rowNumber) => {
    if (rowNumber === 1) return;
    const cells: RawRow['cells'] = {};
    for (const [key, col] of columnOf) cells[key] = toRaw(row.getCell(col).value);
    if (Object.values(cells).some(v => v !== null)) rows.push({ rowNumber, cells });
  });
  if (!rows.length) throw new ImportFileError('The file has no case rows. Put the column headings in row 1 and one case per row below.');
  if (rows.length > MAX_IMPORT_ROWS) throw new ImportFileError(`The file has ${rows.length} rows; the limit is ${MAX_IMPORT_ROWS}. Split it into smaller files.`);
  return rows;
}

function toRaw(value: ExcelJS.CellValue): RawValue {
  if (value === null || value === undefined) return null;
  if (value instanceof Date || typeof value === 'number') return value;
  if (typeof value === 'string') return value.trim() || null;
  if (typeof value === 'boolean') return String(value);
  if ('richText' in value) return toRaw(value.richText.map(t => t.text).join(''));
  if ('result' in value) return toRaw(value.result as ExcelJS.CellValue); // formula: use its last calculated value
  if ('text' in value) return toRaw(value.text as ExcelJS.CellValue); // hyperlink
  return null;
}

const sgtDate = (y: number, mo: number, d: number, h = 0, mi = 0, s = 0) => {
  const utc = new Date(Date.UTC(y, mo - 1, d, h, mi, s));
  // Reject dates that rolled over, e.g. 31/02/2026.
  if (utc.getUTCMonth() !== mo - 1 || utc.getUTCDate() !== d || h > 23 || mi > 59 || s > 59) return 'invalid';
  return new Date(utc.getTime() - SGT_OFFSET_MS);
};
const DAY_FIRST = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})(?:[ T,]+(\d{1,2}):(\d{2})(?::(\d{2}))?\s*(am|pm)?)?$/i;
const ISO_LOCAL = /^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{2}):(\d{2})(?::(\d{2}))?)?$/;
const ISO_ZONED = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:?\d{2})$/i;

/**
 * Parses a spreadsheet date as Singapore time. Accepts Excel date cells, Excel serial numbers,
 * day-first text (30/10/2026 14:05, 30/10/2026 2:05 pm) and ISO text (2026-10-30 14:05, or with a zone).
 */
export function parseImportDate(raw: RawValue): Date | null | 'invalid' {
  if (raw === null) return null;
  // Excel stores the wall-clock time; ExcelJS hands it over as if it were UTC.
  if (raw instanceof Date) return Number.isFinite(raw.getTime()) ? new Date(Math.round(raw.getTime() / 1000) * 1000 - SGT_OFFSET_MS) : 'invalid';
  if (typeof raw === 'number') {
    if (raw < 20_000 || raw > 80_000) return 'invalid'; // outside 1954–2119: not a date serial
    return new Date(Math.round((Date.UTC(1899, 11, 30) + raw * DAY_MS) / 1000) * 1000 - SGT_OFFSET_MS);
  }
  const text = raw.trim();
  if (ISO_ZONED.test(text)) return new Date(text);
  const iso = ISO_LOCAL.exec(text);
  if (iso) return sgtDate(+iso[1], +iso[2], +iso[3], +(iso[4] ?? 0), +(iso[5] ?? 0), +(iso[6] ?? 0));
  const dayFirst = DAY_FIRST.exec(text);
  if (dayFirst) {
    let hour = +(dayFirst[4] ?? 0);
    const meridiem = dayFirst[7]?.toLowerCase();
    if (meridiem) {
      if (hour < 1 || hour > 12) return 'invalid';
      hour = hour % 12 + (meridiem === 'pm' ? 12 : 0);
    }
    return sgtDate(+dayFirst[3], +dayFirst[2], +dayFirst[1], hour, +(dayFirst[5] ?? 0), +(dayFirst[6] ?? 0));
  }
  return 'invalid';
}

function text(raw: RawValue | undefined): string | null {
  if (raw === null || raw === undefined) return null;
  if (raw instanceof Date) return raw.toISOString();
  return String(raw).trim() || null;
}

// Matches a council name ignoring case, spacing and a trailing note such as "(demo)".
const councilKey = (name: string) => squash(name.replace(/\([^)]*\)\s*$/, ''));
function pick<T extends string>(allowed: readonly T[], value: string | null): T | null | undefined {
  if (value === null) return null;
  return allowed.find(a => squash(a) === squash(value));
}

/** Checks one raw row with the case form's rules and returns either a case ready to insert or the reasons it can't be. */
export function checkRow(row: RawRow, councils: { id: string; name: string }[], now = new Date()): PreviewRow {
  const c = row.cells;
  const messages: string[] = [];
  const council = text(c.council);
  const category = text(c.category);
  const preview: PreviewRow = {
    rowNumber: row.rowNumber, result: 'error', messages,
    council, block: text(c.block), category, receivedAt: null, description: text(c.description)
  };

  for (const column of importColumns) {
    if ('required' in column && text(c[column.key]) === null) messages.push(column.header + ' is required.');
  }
  const councilId = council === null ? null : councils.find(x => councilKey(x.name) === councilKey(council))?.id;
  if (council !== null && !councilId) messages.push(`Unknown Town Council "${council}".`);
  const chosen = {
    category: pick(caseCategories, category),
    channel: pick(caseChannels, text(c.channel)),
    status: pick(caseStatuses, text(c.status))
  };
  if (chosen.category === undefined) messages.push('Category must be one of: ' + caseCategories.join(', ') + '.');
  if (chosen.channel === undefined) messages.push('Channel must be one of: ' + caseChannels.join(', ') + '.');
  if (chosen.status === undefined) messages.push('Status must be Open or Closed.');

  const dates = { receivedAt: parseImportDate(c.receivedAt ?? null), acknowledgedAt: parseImportDate(c.acknowledgedAt ?? null), closedAt: parseImportDate(c.closedAt ?? null) };
  for (const key of ['receivedAt', 'acknowledgedAt', 'closedAt'] as const) {
    if (dates[key] === 'invalid') messages.push(`${headerOf[key]} "${text(c[key])}" is not a date. Use a date cell or DD/MM/YYYY HH:MM.`);
  }
  if (dates.receivedAt instanceof Date) preview.receivedAt = dates.receivedAt.toISOString();
  if (messages.length) return preview;

  // Postal codes typed into Excel as numbers lose their leading zero.
  const postal = typeof c.postalCode === 'number' ? String(c.postalCode).padStart(6, '0') : text(c.postalCode);
  const parsed = importCaseBody.safeParse({
    townCouncilId: councilId, block: text(c.block), street: text(c.street), postalCode: postal,
    location: text(c.location), category: chosen.category, channel: chosen.channel, description: text(c.description),
    status: chosen.status ?? undefined, assignedOfficer: text(c.assignedOfficer),
    receivedAt: dates.receivedAt, acknowledgedAt: dates.acknowledgedAt, closedAt: dates.closedAt
  });
  if (!parsed.success) {
    for (const issue of parsed.error.issues) messages.push(`${headerOf[issue.path[0] as ColumnKey] ?? 'Row'}: ${issue.message}`);
    return preview;
  }
  const resolved = resolveCaseDates(parsed.data, now);
  if ('error' in resolved) {
    messages.push(resolved.error.replace(/receivedAt|acknowledgedAt|closedAt/g, key => headerOf[key as ColumnKey]));
    return preview;
  }
  return { ...preview, result: 'ready', value: resolved.value };
}

/**
 * Marks ready rows that repeat an existing case or an earlier row in the file:
 * same Town Council, block and category within 7 days (the "strong" rule the case form uses).
 * Flagged rows can still be imported; the user decides.
 */
export function flagDuplicates(rows: PreviewRow[], existing: ExistingCase[]): PreviewRow[] {
  const key = (x: { townCouncilId: string; block: string; category: string }) => [x.townCouncilId, x.block, x.category].join('|');
  const byKey = new Map<string, { ref: string; at: number }[]>();
  for (const e of existing) {
    const list = byKey.get(key(e)) ?? [];
    list.push({ ref: e.caseRef, at: e.receivedAt.getTime() });
    byKey.set(key(e), list);
  }
  return rows.map(row => {
    if (!row.value) return row;
    const at = row.value.receivedAt.getTime();
    const candidates = byKey.get(key(row.value)) ?? [];
    const closest = candidates
      .map(c => ({ ...c, days: Math.abs(at - c.at) / DAY_MS }))
      .filter(c => c.days <= DUPLICATE_WINDOW_DAYS)
      .sort((a, b) => a.days - b.days)[0];
    // Later rows in the file are compared with this one too.
    byKey.set(key(row.value), [...candidates, { ref: 'row ' + row.rowNumber, at }]);
    if (!closest) return row;
    const days = Math.round(closest.days);
    return {
      ...row, result: 'duplicate' as const,
      messages: [...row.messages, `Possible duplicate of ${closest.ref}: same block and category, ${days} day${days === 1 ? '' : 's'} apart.`]
    };
  });
}

type SheetRow = Partial<Record<ColumnKey, string | Date | null>>;
// Excel shows the stored wall-clock time, so dates are shifted +8h to display in Singapore time.
const excelTime = (ms: number) => new Date(Math.floor(ms / 60_000) * 60_000 + SGT_OFFSET_MS);

/**
 * An .xlsx template with the expected headings, an example row and drop-down lists for the fixed values.
 * Pass rows to pre-fill the Cases sheet (used for the sample data file).
 */
export async function buildTemplate(councils: { name: string }[], rows: SheetRow[] = []): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  // Only the first sheet is imported, so the example lives on its own sheet and can't be imported by mistake.
  const sheet = workbook.addWorksheet('Cases', { views: [{ state: 'frozen', ySplit: 1 }] });
  const exampleSheet = workbook.addWorksheet('Example');
  const lists = workbook.addWorksheet('Lists');
  for (const s of [sheet, exampleSheet]) {
    s.columns = importColumns.map(c => ({ header: c.header, key: c.key, width: c.key === 'description' ? 48 : 20 }));
    s.getRow(1).font = { bold: true };
    for (const key of ['receivedAt', 'acknowledgedAt', 'closedAt']) s.getColumn(key).numFmt = 'dd/mm/yyyy hh:mm';
    s.getColumn('block').numFmt = '@';
    s.getColumn('postalCode').numFmt = '@';
  }

  for (const row of rows) sheet.addRow(row);
  const received = Date.now() - 2 * DAY_MS;
  exampleSheet.addRow({
    council: councils[0]?.name ?? 'North District', block: '210A', street: 'Example Street 1', postalCode: '',
    location: 'Lift lobby L5', category: 'Lift', channel: 'OneService', description: 'Lift stopped between floors 5 and 6.',
    status: 'Closed', assignedOfficer: 'Officer A', receivedAt: excelTime(received),
    acknowledgedAt: excelTime(received + 3_600_000), closedAt: excelTime(received + DAY_MS)
  });
  exampleSheet.addRow([]);
  exampleSheet.addRow(['Fill in cases on the "Cases" sheet. Dates are Singapore time; DD/MM/YYYY HH:MM text also works. Status is optional: a Closed At date marks the case Closed.']);

  const listColumns = [['Town Council', councils.map(c => c.name)], ['Category', caseCategories], ['Channel', caseChannels], ['Status', caseStatuses]] as const;
  listColumns.forEach(([title, values], i) => {
    const col = lists.getColumn(i + 1);
    col.values = [title, ...values];
    col.width = 26;
    const letter = String.fromCharCode(65 + i);
    const range = `Lists!$${letter}$2:$${letter}$${values.length + 1}`;
    const target = sheet.getColumn(importColumns.find(c => c.header === title)!.key).number;
    for (let r = 2; r <= 501; r++) {
      sheet.getCell(r, target).dataValidation = { type: 'list', allowBlank: title === 'Status', formulae: [range], showErrorMessage: true, error: `Pick a ${title} from the list.` };
    }
  });
  lists.getRow(1).font = { bold: true };
  return Buffer.from(await workbook.xlsx.writeBuffer());
}

const sampleCases = [
  ['Cleanliness', 'Bin centre', 'Litter and bulky items left beside the bin centre.'],
  ['Lift', 'Lift lobby L7', 'Lift doors keep reopening before the lift moves.'],
  ['Lighting', 'Common corridor L4', 'Corridor light flickering at night.'],
  ['Pests', 'Void deck', 'Cockroaches seen near the void deck drain.'],
  ['Water Seepage', 'Stairwell L2', 'Water stain spreading on the stairwell ceiling.'],
  ['Estate Maintenance', 'Playground', 'Loose bolt on the playground slide.'],
  ['Others', 'Notice board', 'Resident asking about upcoming upgrading works.']
] as const;

/**
 * A filled-in import file of fictional cases dated in the last two weeks, for demos and testing the import.
 * Most rows are ready to import; the last few contain a deliberate repeat and deliberate errors,
 * so the preview shows every kind of result.
 */
export async function buildSampleFile(councils: { name: string }[], now = Date.now()): Promise<Buffer> {
  const names = councils.length ? councils.map(c => c.name) : ['North District'];
  const officers = ['Officer A', 'Officer B', 'Officer C', null];
  const rows: SheetRow[] = Array.from({ length: 20 }, (_, i) => {
    const [category, location, description] = sampleCases[i % sampleCases.length];
    const received = now - (1 + (i * 5) % 13) * DAY_MS - (i % 9) * 3_600_000;
    const closed = i % 3 === 0;
    return {
      council: names[i % names.length], block: String(400 + i * 7) + (i % 4 === 1 ? 'A' : ''),
      street: `Sample Avenue ${1 + i % 5}`, location, category, channel: caseChannels[i % caseChannels.length], description,
      assignedOfficer: officers[i % officers.length],
      receivedAt: excelTime(received),
      acknowledgedAt: i % 5 === 4 ? null : excelTime(received + (2 + i % 20) * 3_600_000),
      closedAt: closed ? excelTime(received + (1 + i % 3) * DAY_MS) : null
    };
  });
  const repeat = rows[1];
  rows.push(
    { ...repeat, description: 'Sample repeat: same block and category a day later, flagged as a possible duplicate.', receivedAt: excelTime(now - 5 * DAY_MS - 3_600_000), acknowledgedAt: null, closedAt: null },
    { ...rows[2], council: 'Unknown Town Council', description: 'Sample error: this council does not exist.' },
    { ...rows[3], block: 'Blk 12', description: 'Sample error: block must be a number with an optional letter.' },
    { ...rows[4], category: 'Graffiti', description: 'Sample error: category is not in the list.' },
    { ...rows[5], receivedAt: excelTime(now + 3 * DAY_MS), acknowledgedAt: null, closedAt: null, description: 'Sample error: received date is in the future.' }
  );
  return buildTemplate(councils, rows);
}
