import fs from 'fs';
import readline from 'readline';

/**
 * RFC 4180-compliant CSV line parser.
 * Handles quoted fields (with embedded commas and doubled quotes).
 */
function parseLine(line: string): string[] {
  const result: string[] = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') { current += '"'; i++; }
      else inQuotes = !inQuotes;
    } else if (ch === ',' && !inQuotes) {
      result.push(current.trim());
      current = '';
    } else {
      current += ch;
    }
  }
  result.push(current.trim());
  return result;
}

/**
 * Reads a CSV file and returns an array of objects keyed by the header row.
 */
export async function readCsv(filePath: string): Promise<Record<string, string>[]> {
  if (!fs.existsSync(filePath)) {
    throw new Error(`CSV file not found: ${filePath}`);
  }

  const rl = readline.createInterface({
    input: fs.createReadStream(filePath),
    crlfDelay: Infinity,
  });

  const rows: Record<string, string>[] = [];
  let headers: string[] = [];

  for await (const line of rl) {
    const trimmed = line.trim();
    if (!trimmed) continue; // skip blank lines

    const values = parseLine(trimmed);

    if (!headers.length) {
      headers = values.map(h => h.trim());
      continue;
    }

    const row: Record<string, string> = {};
    headers.forEach((h, i) => { row[h] = values[i] ?? ''; });
    rows.push(row);
  }

  return rows;
}
