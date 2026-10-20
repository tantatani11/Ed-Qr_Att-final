const MONTHS = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec',
];

const pad = (n: number) => String(n).padStart(2, '0');

export function formatDate(iso: string | null | undefined): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '—';
  return `${MONTHS[d.getMonth()]} ${pad(d.getDate())}, ${d.getFullYear()}`;
}

export function formatTime(iso: string | null | undefined): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '—';
  let hours = d.getHours();
  const meridiem = hours >= 12 ? 'PM' : 'AM';
  hours = hours % 12;
  if (hours === 0) hours = 12;
  return `${hours}:${pad(d.getMinutes())} ${meridiem}`;
}

export function formatDateTime(iso: string | null | undefined): string {
  if (!iso) return '—';
  return `${formatDate(iso)} · ${formatTime(iso)}`;
}

export function shortId(id: string | null | undefined, chars = 8): string {
  return id ? `…${id.slice(-chars)}` : 'unknown';
}

export function maskUserId(id: string | null | undefined): string {
  if (!id) return '—';
  return `••••${id.slice(0, 4)}-${id.slice(-4)}`;
}