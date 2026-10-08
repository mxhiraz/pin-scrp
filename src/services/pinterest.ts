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
  PinVideo,
  RawPinterestImage,
  RawPinterestPin,
  RawPinterestVideo,
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
    const img = mapImage(raw[k]);
    if (img) out[k] = img;
  }
  return out;
}

// Pinterest search only lists a stream (.m3u8). The same video usually sits as
// a 720p mp4 under /mc/ or /iht/, but not always (10 of 25 had neither, live
// check 2026-10-08), so each address is checked before a clip is returned.
const HLS_PATH = /\/videos\/(?:iht|mc)\/hls\/((?:[0-9a-f]{2}\/){3}[0-9a-f]{32})\.m3u8(?:\?|$)/;
const MP4_CHECK_TIMEOUT_MS = 5_000;

export interface VideoCandidate {
  mp4s: string[];
  width: number;
  height: number;
  seconds: number;
}

export function videoCandidate(
  list: Record<string, RawPinterestVideo> | undefined,
): VideoCandidate | null {
  const entries = Object.values(list ?? {}).filter((v) => v?.url);
  const direct = entries.find((v) => /\.mp4(?:\?|$)/.test(v.url!));
  const stream = entries.find((v) => HLS_PATH.test(v.url!));
  const pick = direct ?? stream;
  if (!pick) return null;
  const path = direct ? null : HLS_PATH.exec(pick.url!)![1];
  return {
    mp4s: direct
      ? [direct.url!]
      : ["mc", "iht"].map((dir) => `https://v1.pinimg.com/videos/${dir}/720p/${path}.mp4`),
    width: pick.width ?? 0,
    height: pick.height ?? 0,
    seconds: Math.round((pick.duration ?? 0) / 100) / 10,
  };
}

/** The first address that answers 200, or null. */
export async function firstPlayable(
  urls: string[],
  fetchImpl: typeof fetch = fetch,
): Promise<string | null> {
  for (const url of urls) {
    try {
      const r = await fetchImpl(url, {
        method: "HEAD",
        signal: AbortSignal.timeout(MP4_CHECK_TIMEOUT_MS),
      });
      if (r.ok) return url;
    } catch {
      // Timeout or network error: try the next address.
    }
  }
  return null;
}

async function resolveVideo(raw: RawPinterestPin): Promise<PinVideo | null> {
  const candidate = videoCandidate(raw.videos?.video_list);
  if (!candidate) return null;
  const mp4 = await firstPlayable(candidate.mp4s);
  if (!mp4) return null;
  const { mp4s: _, ...size } = candidate;
  return { mp4, ...size };
}

export function mapPin(raw: RawPinterestPin): Pin {
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
        followers: raw.pinner.follower_count ?? 0,
        merchant: raw.pinner.is_verified_merchant ?? false,
        ads_only: raw.pinner.is_ads_only_profile ?? false,
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
    video: null,
    labels: raw.pin_join?.visual_annotation ?? [],
    domain: raw.domain ?? "",
    promoted: raw.is_promoted ?? false,
    reactions: Object.values(raw.reaction_counts ?? {}).reduce((sum, n) => sum + (Number(n) || 0), 0),
  };
}

async function doFetch(
  query: string,
  url: string,
  forceRefresh: boolean,
): Promise<Response> {
  const session = await getSession(forceRefresh);
  return fetch(url, {
    method: "GET",
    headers: buildAuthedHeaders(query, session),
  });
}

export async function searchPinterest({
  query,
  count,
  bookmark,
  scope = "pins",
}: SearchParams): Promise<SearchResponse> {
  const data: Record<string, unknown> = {
    options: {
      query,
      scope,
      page_size: count,
      ...(bookmark ? { bookmarks: [bookmark] } : {}),
    },
    context: {},
  };

  const params = new URLSearchParams({
    source_url: `/search/${scope}/?q=${encodeURIComponent(query)}`,
    data: JSON.stringify(data),
  });

  const url = `${PINTEREST_ENDPOINT}?${params.toString()}`;

  let resp: Response;
  try {
    resp = await doFetch(query, url, false);
    if (resp.status === 401 || resp.status === 403) {
      // Session may be stale. Refresh once and retry.
      invalidateSession();
      resp = await doFetch(query, url, true);
    }
  } catch (err) {
    throw new PinterestUpstreamError(
      `Pinterest fetch failed: ${(err as Error).message}`,
    );
  }

  if (!resp.ok) {
    throw new PinterestUpstreamError(`Pinterest returned ${resp.status}`);
  }

  let json: RawPinterestResponse;
  try {
    json = (await resp.json()) as RawPinterestResponse;
  } catch {
    throw new PinterestUpstreamError("Pinterest returned invalid JSON");
  }

  const payload = json.resource_response?.data;
  const results = Array.isArray(payload?.results) ? payload.results : [];
  const bookmarkOut = json.resource_response?.bookmark ?? null;

  const raws = results.filter(
    (r): r is RawPinterestPin => !!r && typeof r === "object" && !!r.id,
  );
  let pins: Pin[] = raws.map(mapPin);
  if (scope === "videos") {
    // A video search returns only clips with a working mp4.
    const videos = await Promise.all(raws.map(resolveVideo));
    pins = pins
      .map((pin, i) => ({ ...pin, video: videos[i] }))
      .filter((pin) => pin.video);
  }

  const guides = (payload?.rankedGuides ?? []).flatMap((guide) => (guide?.term ? [guide.term] : []));

  return {
    query,
    count: pins.length,
    bookmark: bookmarkOut === "-end-" ? null : bookmarkOut,
    pins,
    guides,
  };
}
