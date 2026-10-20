export type QRPayload = {
  v: 1;
  event: string;
  title?: string;
  start?: string;
  end?: string;
  lateAfter?: number;
  // Unix epoch (ms) after which the code should be rejected client-side.
  // Derived from the event end time so a screenshot can't be reused later.
  exp?: number;
};

export function buildQRPayload(event: {
  eventId: string;
  title: string;
  start?: string;
  end?: string;
  lateAfterMinutes?: number;
  expiresAt?: string;
}): string {
  const payload: QRPayload = {
    v: 1,
    event: event.eventId,
  };

  if (event.title) payload.title = event.title;
  if (event.start) payload.start = event.start;
  if (event.end) payload.end = event.end;
  if (event.lateAfterMinutes !== undefined) payload.lateAfter = event.lateAfterMinutes;

  const expSource = event.expiresAt ?? event.end;
  if (expSource) {
    const ms = new Date(expSource).getTime();
    if (!Number.isNaN(ms)) payload.exp = ms;
  }

  return JSON.stringify(payload);
}

export type ParseQRResult =
  | { ok: true; payload: QRPayload }
  | { ok: false; message: string };

export function parseQRPayload(raw: string): ParseQRResult {
  let parsed: any;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return { ok: false, message: 'Invalid QR code.' };
  }

  if (parsed.v !== 1 || typeof parsed.event !== 'string' || !parsed.event) {
    return { ok: false, message: 'Not an attendance QR code.' };
  }

  if (
    parsed.lateAfter !== undefined &&
    (typeof parsed.lateAfter !== 'number' || parsed.lateAfter < 0)
  ) {
    return { ok: false, message: 'Not an attendance QR code.' };
  }

  if (parsed.exp !== undefined) {
    if (typeof parsed.exp !== 'number' || Number.isNaN(parsed.exp)) {
      return { ok: false, message: 'Not an attendance QR code.' };
    }
    if (Date.now() > parsed.exp) {
      return { ok: false, message: 'This QR code has expired.' };
    }
  }

  return { ok: true, payload: parsed as QRPayload };
}