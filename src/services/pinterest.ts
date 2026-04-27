import {
  buildAuthedHeaders,
  getSession,
  invalidateSession,
} from "./session.js";
import {
  Pin,
  PinImage,
  PinImageSizes,
  PinterestUpstreamError,
  RawPinterestImage,
  RawPinterestPin,
  RawPinterestResponse,
  SearchParams,
  SearchResponse,
} from "../types/pinterest.js";

const PINTEREST_ENDPOINT =
  "https://www.pinterest.com/resource/BaseSearchResource/get/";

const SIZE_KEYS: Array<keyof PinImageSizes> = [
  "170x",
  "236x",
  "474x",
  "736x",
  "orig",
];

function mapImage(raw: RawPinterestImage | undefined): PinImage | undefined {
  if (!raw || !raw.url) return undefined;
  return {
    url: raw.url,
    width: raw.width ?? 0,
    height: raw.height ?? 0,
  };
}

function mapImages(raw: Record<string, RawPinterestImage> | undefined): PinImageSizes {
  if (!raw) return {};
  const out: PinImageSizes = {};
  for (const k of SIZE_KEYS) {
    const img = mapImage(raw[k as string]);
    if (img) out[k] = img;
  }
  return out;
}

function mapPin(raw: RawPinterestPin): Pin {
  const id = raw.id ?? "";
  const board =
    raw.board && (raw.board.id || raw.board.name)
      ? { id: raw.board.id ?? "", name: raw.board.name ?? "" }
      : null;

  const creator = raw.pinner
    ? {
        username: raw.pinner.username ?? "",
        display_name: raw.pinner.full_name ?? "",
        avatar_url:
          raw.pinner.image_medium_url ?? raw.pinner.image_small_url ?? null,
      }
    : null;

  return {
    id,
    title: raw.title ?? raw.grid_title ?? "",
    description: raw.description ?? "",
    link: raw.link ?? null,
    pinterest_url: id ? `https://www.pinterest.com/pin/${id}` : "",
    images: mapImages(raw.images),
    dominant_color: raw.dominant_color ?? "",
    saves: raw.aggregated_pin_data?.aggregated_stats?.saves ?? 0,
    created_at: raw.created_at ?? null,
    board,
    creator,
  };
}

async function doFetch(
  query: string,
  url: string,
  forceRefresh: boolean,
  signal?: AbortSignal,
): Promise<Response> {
  const session = await getSession(forceRefresh);
  return fetch(url, {
    method: "GET",
    headers: buildAuthedHeaders(query, session),
    signal,
  });
}

export async function searchPinterest(
  { query, count, bookmark }: SearchParams,
  signal?: AbortSignal,
): Promise<SearchResponse> {
  const data: Record<string, unknown> = {
    options: {
      query,
      scope: "pins",
      page_size: count,
      ...(bookmark ? { bookmarks: [bookmark] } : {}),
    },
    context: {},
  };

  const params = new URLSearchParams({
    source_url: `/search/pins/?q=${encodeURIComponent(query)}`,
    data: JSON.stringify(data),
  });

  const url = `${PINTEREST_ENDPOINT}?${params.toString()}`;

  let resp: Response;
  try {
    resp = await doFetch(query, url, false, signal);
    if (resp.status === 401 || resp.status === 403) {
      // Session may be stale — refresh once and retry.
      invalidateSession();
      resp = await doFetch(query, url, true, signal);
    }
  } catch (err) {
    throw new PinterestUpstreamError(
      `Pinterest fetch failed: ${(err as Error).message}`,
      502,
    );
  }

  if (!resp.ok) {
    throw new PinterestUpstreamError(
      `Pinterest returned ${resp.status}`,
      502,
    );
  }

  let json: RawPinterestResponse;
  try {
    json = (await resp.json()) as RawPinterestResponse;
  } catch {
    throw new PinterestUpstreamError("Pinterest returned invalid JSON", 502);
  }

  const data2 = json.resource_response?.data;
  const results = Array.isArray(data2?.results) ? data2.results : [];
  const bookmarkOut = json.resource_response?.bookmark ?? null;

  const pins: Pin[] = results
    .filter((r): r is RawPinterestPin => !!r && typeof r === "object")
    .map(mapPin)
    .filter((p) => p.id);

  return {
    query,
    count: pins.length,
    bookmark: bookmarkOut === "-end-" ? null : bookmarkOut,
    pins,
  };
}
