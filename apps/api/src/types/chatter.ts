/**
 * TypeScript types for chatter schema
 * Based on create-chatter-request.schema.json and chatter.schema.json
 */

// ============================================================================
// CLIENT REQUEST TYPES (CreateChatterRequest)
// ============================================================================

export interface LocationHint {
	lat: number;
	lng: number;
	accuracy_m?: number;
}

export interface PlaceInput {
	name: string;
	formatted_address: string;
	short_address: string;
	location: {
		lat: number;
		lng: number;
	};
	provider_ids?: Record<string, string>;
}

export interface CreateChatterRequest {
	kind: 'chatter';
	content: string;
	date_posted: string;
	title?: string;
	tags?: string[];
	images?: string[];
	publish?: boolean;
	location_hint?: LocationHint;
	place?: PlaceInput;
}

// ============================================================================
// PROVIDER & SNAPSHOT TYPES
// ============================================================================

export interface ProviderInfo {
	name: string; // e.g. 'google'
	product: string; // e.g. 'weather', 'air_quality'
	version?: string; // e.g. 'v1'
}

export interface ApiSnapshot<T> {
	captured_at: string; // ISO 8601
	provider: ProviderInfo;
	summary: T;
	full?: Record<string, any>; // Raw API response
}

// ============================================================================
// SUMMARY TYPES (normalized data)
// ============================================================================

export interface WeatherSummary {
	timestamp?: string;
	temp_f?: number;
	temp_feels_f?: number;
	condition_code?: string;
	condition_text?: string;
	is_daytime?: boolean;
	humidity_pct?: number;
	pressure_inhg?: number;
	wind_speed_mph?: number;
	wind_gust_mph?: number;
	wind_dir_deg?: number;
	precip_in_last_1h?: number;
	precip_chance_pct?: number;
	cloud_pct?: number;
	visibility_miles?: number;
	uv_index?: number;
}

export interface AirQualitySummary {
	timestamp?: string;
	aqi?: number;
	aqi_scale?: string; // e.g. 'US EPA'
	aqi_category?: string; // e.g. 'Good', 'Moderate'
	dominant_pollutant?: string;
	pm25_ugm3?: number;
	pm10_ugm3?: number;
	o3_ppb?: number | null;
	no2_ppb?: number | null;
	so2_ppb?: number | null;
	co_ppm?: number | null;
}

export interface PollenSummary {
	date?: string;
	index_overall?: number;
	index_category?: string;
	tree_index?: number | null;
	tree_category?: string | null;
	grass_index?: number | null;
	grass_category?: string | null;
	weed_index?: number | null;
	weed_category?: string | null;
}

export interface PlaceSummary {
	name: string;
	formatted_address: string;
	short_address?: string;
	lat: number;
	lng: number;
	place_id?: string;
	maps_url?: string;
	website_url?: string | null;
	phone?: string | null;
	types?: string[];
	rating?: number | null;
	user_rating_count?: number | null;
	price_level?: number | null;
	provider_ids?: Record<string, string>;
}

export interface GeocodingSummary {
	lat: number;
	lng: number;
	formatted_address: string;
	country_code?: string;
	country_name?: string;
	region_code?: string;
	region_name?: string;
	locality?: string;
	postal_code?: string;
	neighborhood?: string | null;
	street_name?: string | null;
	street_number?: string | null;
}

export interface ElevationSummary {
	lat: number;
	lng: number;
	elevation_ft: number;
}

// ============================================================================
// SPECIALIZED SNAPSHOT TYPES
// ============================================================================

export type ApiSnapshot_Weather = ApiSnapshot<WeatherSummary>;
export type ApiSnapshot_AirQuality = ApiSnapshot<AirQualitySummary>;
export type ApiSnapshot_Pollen = ApiSnapshot<PollenSummary>;
export type ApiSnapshot_Place = ApiSnapshot<PlaceSummary>;
export type ApiSnapshot_Geocoding = ApiSnapshot<GeocodingSummary>;
export type ApiSnapshot_Elevation = ApiSnapshot<ElevationSummary>;

// ============================================================================
// ENVIRONMENT WRAPPER
// ============================================================================

export interface Environment {
	place?: ApiSnapshot_Place;
	geocoding?: ApiSnapshot_Geocoding;
	elevation?: ApiSnapshot_Elevation;
	weather?: ApiSnapshot_Weather;
	air_quality?: ApiSnapshot_AirQuality;
	pollen?: ApiSnapshot_Pollen;
}

// ============================================================================
// CHATTER DATA (inner payload)
// ============================================================================

export interface ChatterData {
	kind: 'chatter';
	content: string;
	date_posted: string;
	title?: string;
	tags?: string[];
	images?: string[];
	publish?: boolean;
	location_hint?: LocationHint;
	place?: PlaceInput;
	environment?: Environment;
}

// ============================================================================
// CHATTER (complete storage format)
// ============================================================================

export interface Chatter {
	type: 'chatter';
	id: string; // sha256:...
	schema_version?: string; // e.g. '1.1.0'
	data: ChatterData;
}
