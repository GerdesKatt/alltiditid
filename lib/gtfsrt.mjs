// Fordonspositioner ur ett GTFS Realtime-flöde (protobuf), utan bibliotek.
// Bara det som behövs läses: turens id, latitud, longitud och tidpunkt per fordon.
//
// FeedMessage { 2: repeated FeedEntity }
// FeedEntity  { 4: VehiclePosition }
// VehiclePosition { 1: TripDescriptor, 2: Position, 5: timestamp (varint) }
// TripDescriptor  { 1: trip_id (string) }
// Position        { 1: latitude (float), 2: longitude (float) }

function reader(bytes) {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let pos = 0;
  const varint = () => {
    let result = 0;
    let shift = 0;
    for (;;) {
      if (pos >= bytes.length) throw new Error('avklippt');
      const b = bytes[pos++];
      // Multiplikation i stället för skift: tidsstämplar får plats, 32-bitarsskift räcker inte.
      result += (b & 0x7f) * 2 ** shift;
      shift += 7;
      if ((b & 0x80) === 0) return result;
      if (shift > 63) throw new Error('för långt tal');
    }
  };
  return {
    done: () => pos >= bytes.length,
    /** Nästa fält: [nummer, värde]. Längdavgränsade fält ger bytes, övriga tal. */
    field() {
      const key = varint();
      const number = Math.floor(key / 8);
      const wire = key % 8;
      if (wire === 0) return [number, varint()];
      if (wire === 2) {
        const len = varint();
        if (pos + len > bytes.length) throw new Error('avklippt');
        const sub = bytes.subarray(pos, pos + len);
        pos += len;
        return [number, sub];
      }
      if (wire === 5) {
        if (pos + 4 > bytes.length) throw new Error('avklippt');
        const v = view.getFloat32(pos, true);
        pos += 4;
        return [number, v];
      }
      if (wire === 1) {
        if (pos + 8 > bytes.length) throw new Error('avklippt');
        pos += 8;
        return [number, null];
      }
      throw new Error(`okänd trådtyp ${wire}`);
    },
  };
}

function fields(bytes, onField) {
  const r = reader(bytes);
  while (!r.done()) {
    const [number, value] = r.field();
    onField(number, value);
  }
}

const utf8 = new TextDecoder();

/**
 * @param {Uint8Array} bytes VehiclePositions.pb
 * @returns {Record<string, [number, number, number]>} tur-id → [lat, lon, tidsstämpel i sekunder]
 */
export function vehiclePositions(bytes) {
  const out = {};
  try {
    fields(bytes, (n, entity) => {
      if (n !== 2 || !(entity instanceof Uint8Array)) return;
      fields(entity, (en, vehicle) => {
        if (en !== 4 || !(vehicle instanceof Uint8Array)) return;
        let tripId = '';
        let lat = null;
        let lon = null;
        let ts = 0;
        fields(vehicle, (vn, v) => {
          if (vn === 1 && v instanceof Uint8Array) {
            fields(v, (tn, tv) => {
              if (tn === 1 && tv instanceof Uint8Array) tripId = utf8.decode(tv);
            });
          } else if (vn === 2 && v instanceof Uint8Array) {
            fields(v, (pn, pv) => {
              if (pn === 1 && typeof pv === 'number') lat = pv;
              if (pn === 2 && typeof pv === 'number') lon = pv;
            });
          } else if (vn === 5 && typeof v === 'number') {
            ts = v;
          }
        });
        if (tripId && lat !== null && lon !== null && Math.abs(lat) <= 90 && Math.abs(lon) <= 180 && (lat !== 0 || lon !== 0)) {
          out[tripId] = [Math.round(lat * 1e5) / 1e5, Math.round(lon * 1e5) / 1e5, ts];
        }
      });
    });
  } catch {
    // Ett avklippt flöde: det som hann läsas gäller.
  }
  return out;
}

/** Avstånd i meter mellan två punkter (räcker gott på hållplatsavstånd). */
export function metersBetween(lat1, lon1, lat2, lon2) {
  const rad = Math.PI / 180;
  const x = (lon2 - lon1) * rad * Math.cos(((lat1 + lat2) / 2) * rad);
  const y = (lat2 - lat1) * rad;
  return Math.sqrt(x * x + y * y) * 6371000;
}

/**
 * Var på sträckan fordonet är: mellan vilka två hållplatser, och hur långt kvar till nästa.
 * Punkten läggs på närmaste raka sträcka mellan två hållplatser i följd.
 * @param {{ lat?: number, lon?: number }[]} stops Hållplatserna i ordning.
 * @returns {{ index: number, fraction: number, metersToNext: number, offRoute: number } | null}
 *   index = hållplatsen fordonet senast lämnade; fraction 0–1 längs sträckan till nästa.
 */
export function locateOnRoute(stops, lat, lon) {
  let best = null;
  for (let i = 0; i < stops.length - 1; i += 1) {
    const a = stops[i];
    const b = stops[i + 1];
    if (a?.lat == null || a?.lon == null || b?.lat == null || b?.lon == null) continue;
    const rad = Math.PI / 180;
    const k = Math.cos(((a.lat + b.lat) / 2) * rad);
    const ax = a.lon * k;
    const bx = b.lon * k;
    const px = lon * k;
    const dx = bx - ax;
    const dy = b.lat - a.lat;
    const len2 = dx * dx + dy * dy;
    const t = len2 === 0 ? 0 : Math.max(0, Math.min(1, ((px - ax) * dx + (lat - a.lat) * dy) / len2));
    const qLat = a.lat + t * dy;
    const qLon = (ax + t * dx) / k;
    const off = metersBetween(lat, lon, qLat, qLon);
    if (!best || off < best.offRoute) {
      best = { index: i, fraction: t, metersToNext: Math.round(metersBetween(qLat, qLon, b.lat, b.lon)), offRoute: Math.round(off) };
    }
  }
  return best;
}
