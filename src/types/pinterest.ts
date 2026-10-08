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
  followers: number;
  /** Pinterest marks shops as verified merchants and ad-only accounts as such. */
  merchant: boolean;
  ads_only: boolean;
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
  /** Pinterest's own labels for the pin, e.g. "Sunscreen Advertisement". */
  labels: string[];
  /** Where the pin links ("instagram.com", a shop), or "Uploaded by user". */
  domain: string;
  /** A paid Pinterest ad. */
  promoted: boolean;
  /** All reactions added up. */
  reactions: number;
}

export interface SearchResponse {
  query: string;
  count: number;
  bookmark: string | null;
  pins: Pin[];
  /** Pinterest's suggested searches for this query, best first. */
  guides: string[];
}

export const SCOPES = ["pins", "videos"] as const;
export type Scope = (typeof SCOPES)[number];

export interface SearchParams {
  query: string;
  count: number;
  bookmark?: string;
  scope?: Scope;
  /** Check each video's mp4 (default). Off for a page that is only skipped past. */
  checkVideos?: boolean;
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
  domain?: string;
  is_promoted?: boolean;
  reaction_counts?: Record<string, number>;
  pin_join?: { visual_annotation?: string[] } | null;
  images?: Record<string, RawPinterestImage>;
  videos?: { video_list?: Record<string, RawPinterestVideo> } | null;
  /** Idea Pins keep their video here, not in `videos`; most video results are Idea Pins. */
  story_pin_data?: { pages?: { blocks?: { video?: { video_list?: Record<string, RawPinterestVideo> } | null }[] }[] } | null;
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
    follower_count?: number;
    is_verified_merchant?: boolean;
    is_ads_only_profile?: boolean;
  };
}

export interface RawPinterestResponse {
  resource_response?: {
    data?: {
      results?: RawPinterestPin[];
      rankedGuides?: { term?: string }[];
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
