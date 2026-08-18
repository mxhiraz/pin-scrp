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
}

export interface SearchResponse {
  query: string;
  count: number;
  bookmark: string | null;
  pins: Pin[];
}

export interface SearchParams {
  query: string;
  count: number;
  bookmark?: string;
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
