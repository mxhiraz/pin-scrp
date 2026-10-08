export interface PinImage {
  url: string;
  width: number;
  height: number;
}

export interface PinImageSizes {
  "170x"?: PinImage;
  "236x"?: PinImage;
  "474x"?: PinImage;
  "736x"?: PinImage;
  orig?: PinImage;
}

export interface PinBoard {
  id: string;
  name: string;
}

export interface PinCreator {
  username: string;
  display_name: string;
  avatar_url: string | null;
}

/** A video pin's playable file. Null on photo pins. */
export interface PinVideo {
  mp4: string;
  width: number;
  height: number;
  seconds: number;
}

export interface Pin {
  id: string;
  title: string;
  description: string;
  link: string | null;
  pinterest_url: string;
  images: PinImageSizes;
  dominant_color: string;
  saves: number;
  created_at: string | null;
  board: PinBoard | null;
  creator: PinCreator | null;
  video: PinVideo | null;
}

export interface SearchResponse {
  query: string;
  count: number;
  bookmark: string | null;
  pins: Pin[];
}

export const SCOPES = ["pins", "videos"] as const;
export type Scope = (typeof SCOPES)[number];

export interface SearchParams {
  query: string;
  count: number;
  bookmark?: string;
  scope?: Scope;
}

export interface RawPinterestVideo {
  url?: string;
  width?: number;
  height?: number;
  /** Milliseconds. */
  duration?: number;
}

export interface RawPinterestImage {
  url?: string;
  width?: number;
  height?: number;
}

export interface RawPinterestPin {
  id?: string;
  title?: string;
  grid_title?: string;
  description?: string;
  link?: string | null;
  images?: Record<string, RawPinterestImage>;
  videos?: { video_list?: Record<string, RawPinterestVideo> } | null;
  dominant_color?: string;
  created_at?: string;
  aggregated_pin_data?: {
    aggregated_stats?: {
      saves?: number;
    };
  };
  board?: {
    id?: string;
    name?: string;
  };
  pinner?: {
    username?: string;
    full_name?: string;
    image_small_url?: string;
    image_medium_url?: string;
  };
}

export interface RawPinterestResponse {
  resource_response?: {
    data?: {
      results?: RawPinterestPin[];
    };
    bookmark?: string | null;
  };
}

export class PinterestUpstreamError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PinterestUpstreamError";
  }
}
