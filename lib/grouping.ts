// Shared grouping helper: separate items into academic buckets
// (Program → Year Level → Block). Used by Admin Users and Teacher History
// so both screens group students the same way.

export type AcademicBucket<T> = {
  key: string;
  program: string;
  year: string;
  block: string;
  members: T[];
};

const YEAR_ORDER = ['1st Year', '2nd Year', '3rd Year', '4th Year'];

function yearRank(year: string): number {
  const i = YEAR_ORDER.indexOf(year);
  return i === -1 ? 99 : i;
}

export function groupByAcademic<T>(
  items: T[],
  getAcademic: (item: T) => { program?: string | null; year?: string | null; block?: string | null }
): AcademicBucket<T>[] {
  const map = new Map<string, AcademicBucket<T>>();
  for (const item of items) {
    const a = getAcademic(item);
    const program = a.program?.trim() || 'Unassigned';
    const year = a.year?.trim() || 'Unassigned';
    const block = a.block?.trim() || '–';
    const key = `${program}|||${year}|||${block}`;
    const bucket = map.get(key);
    if (bucket) {
      bucket.members.push(item);
    } else {
      map.set(key, { key, program, year, block, members: [item] });
    }
  }
  return [...map.values()].sort((x, y) => {
    const unX = x.program === 'Unassigned' ? 1 : 0;
    const unY = y.program === 'Unassigned' ? 1 : 0;
    if (unX !== unY) return unX - unY;
    if (x.program !== y.program) return x.program.localeCompare(y.program);
    if (yearRank(x.year) !== yearRank(y.year)) return yearRank(x.year) - yearRank(y.year);
    return x.block.localeCompare(y.block);
  });
}

export function bucketLabel(b: { program: string; year: string; block: string }): string {
  return `${b.program} · ${b.year} · ${b.block === '–' ? 'No block' : `Block ${b.block}`}`;
}
