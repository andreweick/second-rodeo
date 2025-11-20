// Types for API responses and data structures
interface TokenResponse {
  authToken: string;
  googlePlacesApiKey: string;
}

interface Coordinates {
  latitude: number;
  longitude: number;
}

interface GooglePlaceResult {
  name: string;
  vicinity: string;
  geometry: {
    location: {
      lat: number;
      lng: number;
    };
  };
  formatted_address?: string;
  address_components?: Array<{
    long_name: string;
    short_name: string;
    types: string[];
  }>;
}

interface GooglePlacesNearbyResponse {
  results: GooglePlaceResult[];
  status: string;
}

interface GooglePlaceDetailsResponse {
  result: GooglePlaceResult;
  status: string;
}

interface CheckinData {
  venue_name: string;
  latitude: number;
  longitude: number;
  formatted_address: string;
  street: string;
  city: string;
  state: string;
  postal_code: string;
  country: string;
  datetime: string;
  publish: boolean;
}

interface ChatterData {
  title: string | null;
  content: string;
  date: string;
  date_posted: string;
  tags: string[];
  images: string[];
  publish: boolean;
  venue_name?: string;
  latitude?: number;
  longitude?: number;
  formatted_address?: string;
  street?: string;
  city?: string;
  state?: string;
  postal_code?: string;
  country?: string;
}

interface UploadRequest {
  type: string;
  data: CheckinData | ChatterData;
}

interface PollenData {
  dailyInfo?: Array<{
    pollenTypeInfo?: Array<{
      code: string;
      displayName: string;
      indexInfo: {
        value: number;
        category: string;
      };
    }>;
  }>;
}

interface AirQualityData {
  indexes?: Array<{
    aqi: number;
    category: string;
  }>;
}

interface WeatherData {
  temperature?: {
    degrees: number;
    unit: string;
  };
  weatherCondition?: {
    description?: {
      text: string;
    };
  };
}

interface ElevationData {
  results?: Array<{
    elevation: number;
  }>;
}

// Global state
let authToken: string | null = null;
let googlePlacesApiKey: string | null = null;
let userCoordinates: Coordinates | null = null;
let userLocationData: { city: string; state: string; country: string } | null = null;

// Debug logging helper
function addDebugInfo(message: string): void {
  // Always log to console
  console.log(message);

  // Only show in UI if debug toggle is checked
  const debugToggle = document.getElementById('debug-toggle') as HTMLInputElement;
  if (!debugToggle || !debugToggle.checked) {
    return;
  }

  const debugDiv = document.getElementById('debug-info');
  const debugContent = document.getElementById('debug-content');

  if (debugDiv && debugContent) {
    debugDiv.style.display = 'block';
    const timestamp = new Date().toLocaleTimeString();
    debugContent.textContent += `[${timestamp}] ${message}\n`;
  }
}

// Fetch tokens from API
async function fetchTokens(): Promise<void> {
  try {
    const response = await fetch('/api/token');
    if (!response.ok) {
      throw new Error(`Failed to fetch tokens: ${response.statusText}`);
    }
    const data: TokenResponse = await response.json();
    authToken = data.authToken;
    googlePlacesApiKey = data.googlePlacesApiKey;
  } catch (error) {
    console.error('Token fetch error:', error);
    showError('Failed to authenticate. Please refresh the page.');
    throw error;
  }
}

// Check permission state using Permissions API
async function checkGeolocationPermission(): Promise<string> {
  try {
    if ('permissions' in navigator) {
      const result = await navigator.permissions.query({ name: 'geolocation' });
      addDebugInfo(`Permissions API state: ${result.state}`);
      return result.state;
    } else {
      addDebugInfo('Permissions API not supported');
      return 'unknown';
    }
  } catch (error) {
    addDebugInfo(`Permissions API error: ${error}`);
    return 'error';
  }
}

// Get user's current location
async function getUserLocation(): Promise<Coordinates> {
  return new Promise(async (resolve, reject) => {
    // Check if geolocation is supported
    if (!navigator.geolocation) {
      addDebugInfo('ERROR: Geolocation is not supported by your browser');
      reject(new Error('Geolocation is not supported by your browser'));
      return;
    }

    // Add system diagnostics
    addDebugInfo(`HTTPS: ${window.location.protocol === 'https:'}`);
    addDebugInfo(`User Agent: ${navigator.userAgent}`);

    // Check permission state first
    await checkGeolocationPermission();

    addDebugInfo('Trying getCurrentPosition...');

    navigator.geolocation.getCurrentPosition(
      position => {
        const coords = {
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
        };
        addDebugInfo(`✅ getCurrentPosition succeeded: ${coords.latitude}, ${coords.longitude}`);
        addDebugInfo(`Accuracy: ${position.coords.accuracy}m`);
        resolve(coords);
      },
      error => {
        addDebugInfo(`❌ getCurrentPosition failed: Code ${error.code} - ${error.message}`);

        // If getCurrentPosition fails with PERMISSION_DENIED, try watchPosition as fallback
        if (error.code === error.PERMISSION_DENIED) {
          addDebugInfo('Retrying with watchPosition (iOS Safari fallback)...');

          let watchId: number | null = null;
          const watchTimeout = setTimeout(() => {
            if (watchId !== null) {
              navigator.geolocation.clearWatch(watchId);
            }
            addDebugInfo('❌ watchPosition timed out after 30s');
            reject(error);
          }, 30000);

          watchId = navigator.geolocation.watchPosition(
            position => {
              clearTimeout(watchTimeout);
              if (watchId !== null) {
                navigator.geolocation.clearWatch(watchId);
              }
              const coords = {
                latitude: position.coords.latitude,
                longitude: position.coords.longitude,
              };
              addDebugInfo(`✅ watchPosition succeeded: ${coords.latitude}, ${coords.longitude}`);
              addDebugInfo(`Accuracy: ${position.coords.accuracy}m`);
              resolve(coords);
            },
            watchError => {
              clearTimeout(watchTimeout);
              if (watchId !== null) {
                navigator.geolocation.clearWatch(watchId);
              }
              addDebugInfo(`❌ watchPosition also failed: Code ${watchError.code} - ${watchError.message}`);
              reject(watchError);
            },
            {
              enableHighAccuracy: true,
              timeout: 30000,
              maximumAge: 0,
            }
          );
        } else {
          addDebugInfo(`Error PERMISSION_DENIED=${error.PERMISSION_DENIED}, POSITION_UNAVAILABLE=${error.POSITION_UNAVAILABLE}, TIMEOUT=${error.TIMEOUT}`);
          reject(error);
        }
      },
      {
        enableHighAccuracy: true,
        timeout: 30000,
        maximumAge: 0,
      }
    );
  });
}

// Get friendly error message for geolocation error
function getLocationErrorMessage(error: GeolocationPositionError): string {
  switch (error.code) {
    case error.PERMISSION_DENIED:
      return 'Location permission denied. Please enable location access in your device Settings → Safari → Location.';
    case error.POSITION_UNAVAILABLE:
      return 'Could not determine your location. Please check that Location Services is enabled in your device settings.';
    case error.TIMEOUT:
      return 'Location request timed out. Please ensure you have a clear view of the sky and try again.';
    default:
      return 'Unable to get your location. Please try again.';
  }
}

// Extract city, state, country from Places API results
function extractLocationFromPlaces(places: any[]): void {
  if (!places || places.length === 0) {
    addDebugInfo('No places available to extract location data');
    return;
  }

  // Try each place until we find one with good address data
  for (const place of places) {
    const addressParts = parseAddressComponents(place);

    if (addressParts.city || addressParts.state || addressParts.country) {
      userLocationData = {
        city: addressParts.city,
        state: addressParts.state,
        country: addressParts.country
      };
      addDebugInfo(`Extracted location from Places API: ${addressParts.city}, ${addressParts.state}, ${addressParts.country}`);
      return;
    }
  }

  addDebugInfo('Could not extract location data from any places');
}

// Fetch pollen data from Google Pollen API
async function fetchPollenData(coords: Coordinates): Promise<PollenData | null> {
  if (!googlePlacesApiKey) return null;

  const url = `https://pollen.googleapis.com/v1/forecast:lookup?location.latitude=${coords.latitude}&location.longitude=${coords.longitude}&days=1&key=${googlePlacesApiKey}`;
  console.log('Pollen API URL:', url.replace(googlePlacesApiKey, 'API_KEY'));

  try {
    const response = await fetch(url);
    console.log('Pollen API response status:', response.status, response.statusText);
    if (!response.ok) {
      const errorText = await response.text();
      console.error('Pollen API error response:', errorText);
      addDebugInfo(`Pollen API error ${response.status}: ${response.statusText}`);
      return null;
    }
    const data: PollenData = await response.json();
    console.log('Pollen API full response:', JSON.stringify(data, null, 2));
    if (data.dailyInfo?.[0]?.pollenTypeInfo?.[0]) {
      console.log('Pollen structure:', data.dailyInfo[0].pollenTypeInfo[0]);
    }
    addDebugInfo(`Pollen data fetched successfully`);
    return data;
  } catch (error) {
    console.error('Pollen API error:', error);
    addDebugInfo(`Pollen API failed: ${error}`);
    return null;
  }
}

// Fetch air quality data from Google Air Quality API
async function fetchAirQualityData(coords: Coordinates): Promise<AirQualityData | null> {
  if (!googlePlacesApiKey) return null;

  const url = `https://airquality.googleapis.com/v1/currentConditions:lookup?key=${googlePlacesApiKey}`;

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        location: {
          latitude: coords.latitude,
          longitude: coords.longitude,
        },
        universalAqi: true,
      }),
    });

    if (!response.ok) {
      addDebugInfo(`Air Quality API error: ${response.statusText}`);
      return null;
    }
    const data: AirQualityData = await response.json();
    addDebugInfo(`Air Quality data fetched successfully`);
    return data;
  } catch (error) {
    console.error('Air Quality API error:', error);
    addDebugInfo(`Air Quality API failed: ${error}`);
    return null;
  }
}

// Fetch weather data from Google Weather API
async function fetchWeatherData(coords: Coordinates): Promise<WeatherData | null> {
  if (!googlePlacesApiKey) return null;

  const url = `https://weather.googleapis.com/v1/currentConditions:lookup?location.latitude=${coords.latitude}&location.longitude=${coords.longitude}&key=${googlePlacesApiKey}`;

  try {
    const response = await fetch(url);
    if (!response.ok) {
      addDebugInfo(`Weather API error: ${response.statusText}`);
      return null;
    }
    const data: WeatherData = await response.json();
    addDebugInfo(`Weather data fetched successfully`);
    return data;
  } catch (error) {
    console.error('Weather API error:', error);
    addDebugInfo(`Weather API failed: ${error}`);
    return null;
  }
}

// Fetch elevation data from Google Elevation API
async function fetchElevationData(coords: Coordinates): Promise<ElevationData | null> {
  if (!googlePlacesApiKey) return null;

  const url = `https://maps.googleapis.com/maps/api/elevation/json?locations=${coords.latitude},${coords.longitude}&key=${googlePlacesApiKey}`;
  console.log('Elevation API URL:', url.replace(googlePlacesApiKey, 'API_KEY'));

  try {
    const response = await fetch(url);
    console.log('Elevation API response status:', response.status, response.statusText);
    if (!response.ok) {
      const errorText = await response.text();
      console.error('Elevation API error response:', errorText);
      addDebugInfo(`Elevation API error: ${response.statusText}`);
      return null;
    }
    const data: ElevationData = await response.json();
    console.log('Elevation API full response:', JSON.stringify(data, null, 2));
    addDebugInfo(`Elevation data fetched successfully`);
    return data;
  } catch (error) {
    console.error('Elevation API error:', error);
    addDebugInfo(`Elevation API failed: ${error}`);
    return null;
  }
}

// Fetch all environmental data and populate content textarea
async function fetchEnvironmentalData(coords: Coordinates): Promise<void> {
  if (!googlePlacesApiKey || !coords) {
    console.log('fetchEnvironmentalData: Missing API key or coords', { googlePlacesApiKey: !!googlePlacesApiKey, coords });
    addDebugInfo('Environmental data skipped: missing API key or coordinates');
    return;
  }

  console.log('fetchEnvironmentalData: Starting...', coords);
  addDebugInfo(`Fetching environmental data for ${coords.latitude}, ${coords.longitude}...`);

  try {
    // Fetch all data in parallel
    const [pollen, airQuality, weather, elevation] = await Promise.all([
      fetchPollenData(coords),
      fetchAirQualityData(coords),
      fetchWeatherData(coords),
      fetchElevationData(coords),
    ]);

    console.log('Environmental API responses:', { pollen, airQuality, weather, elevation });

    // Build sentence from available data
    const parts: string[] = [];

    if (weather?.temperature?.degrees) {
      const temp = Math.round(weather.temperature.degrees);
      const unit = weather.temperature.unit === 'FAHRENHEIT' ? 'F' : 'C';
      const condition = weather.weatherCondition?.description?.text || 'clear';
      parts.push(`Currently ${temp}°${unit} and ${condition}.`);
    }

    if (airQuality?.indexes?.[0]) {
      const aqi = airQuality.indexes[0].aqi;
      const category = airQuality.indexes[0].category;
      parts.push(`Air quality is ${category} (AQI: ${aqi}).`);
    }

    if (pollen?.dailyInfo?.[0]?.pollenTypeInfo?.[0]) {
      const pollenInfo = pollen.dailyInfo[0].pollenTypeInfo[0];
      const category = pollenInfo.indexInfo?.category || pollenInfo.indexInfo?.value || 'unknown';
      const displayName = pollenInfo.displayName || pollenInfo.code || 'Pollen';
      parts.push(`${displayName} pollen: ${category}.`);
    }

    if (elevation?.results?.[0]?.elevation) {
      const meters = Math.round(elevation.results[0].elevation);
      const feet = Math.round(meters * 3.28084);
      parts.push(`Elevation: ${meters}m (${feet}ft).`);
    }

    if (parts.length > 0) {
      const sentence = parts.join(' ');
      console.log('Environmental sentence built:', sentence);
      addDebugInfo(`Built environmental sentence: ${sentence}`);

      const contentTextarea = document.getElementById('content') as HTMLTextAreaElement;
      if (contentTextarea) {
        // Prepend to existing content with newline separation
        const existingContent = contentTextarea.value.trim();
        contentTextarea.value = existingContent
          ? `${sentence}\n\n${existingContent}`
          : sentence;
        console.log('Environmental data added to content textarea');
        addDebugInfo(`Environmental data added to content successfully`);
      } else {
        console.error('Content textarea not found!');
        addDebugInfo('ERROR: Content textarea element not found');
      }
    } else {
      console.log('No environmental data available from APIs');
      addDebugInfo('No environmental data available from any API');
    }
  } catch (error) {
    console.error('Environmental data fetch error:', error);
    addDebugInfo(`Failed to fetch environmental data: ${error}`);
  }
}

// Fetch nearby places from Google Places API
async function fetchNearbyPlaces(coords: Coordinates): Promise<GooglePlaceResult[]> {
  if (!googlePlacesApiKey) {
    addDebugInfo('ERROR: Google Places API key not available');
    throw new Error('Google Places API key not available');
  }

  const url = `https://places.googleapis.com/v1/places:searchNearby`;
  const requestBody = {
    maxResultCount: 5,
    locationRestriction: {
      circle: {
        center: {
          latitude: coords.latitude,
          longitude: coords.longitude,
        },
        radius: 500.0,
      },
    },
  };

  addDebugInfo(`Fetching nearby places from Google Places API...`);
  addDebugInfo(`Request: ${JSON.stringify(requestBody)}`);

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Goog-Api-Key': googlePlacesApiKey,
        'X-Goog-FieldMask': 'places.displayName,places.formattedAddress,places.location,places.addressComponents,places.photos',
      },
      body: JSON.stringify(requestBody),
    });

    addDebugInfo(`Google Places API Response Status: ${response.status} ${response.statusText}`);

    if (!response.ok) {
      const errorText = await response.text();
      addDebugInfo(`Google Places API Error Response: ${errorText}`);
      throw new Error(`Google Places API error: ${response.statusText}`);
    }

    const data = await response.json();
    addDebugInfo(`Google Places API Response: ${JSON.stringify(data).substring(0, 500)}...`);
    addDebugInfo(`Found ${data.places?.length || 0} places`);

    if (data.places && data.places.length > 0) {
      data.places.forEach((place: any, index: number) => {
        addDebugInfo(`  Place ${index + 1}: ${place.displayName?.text || 'Unknown'}`);
      });
    }

    return data.places || [];
  } catch (error) {
    console.error('Google Places API error:', error);
    addDebugInfo(`Google Places API exception: ${error}`);
    return [];
  }
}

// Parse address components from Google Place
function parseAddressComponents(place: any): {
  street: string;
  city: string;
  state: string;
  postal_code: string;
  country: string;
} {
  const components = place.addressComponents || [];
  let street = '';
  let city = '';
  let state = '';
  let postal_code = '';
  let country = '';

  for (const component of components) {
    const types = component.types || [];
    if (types.includes('street_number') || types.includes('route')) {
      street += (street ? ' ' : '') + component.longText;
    } else if (types.includes('locality')) {
      city = component.longText;
    } else if (types.includes('administrative_area_level_1')) {
      state = component.longText;
    } else if (types.includes('postal_code')) {
      postal_code = component.longText;
    } else if (types.includes('country')) {
      country = component.longText;
    }
  }

  return { street, city, state, postal_code, country };
}

// Display location options
function displayLocationOptions(places: any[], hasLocation: boolean): void {
  const container = document.getElementById('location-options');
  if (!container) return;

  container.innerHTML = '';

  // Display nearby places with photos
  places.forEach((place, index) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'location-option';
    button.dataset.index = index.toString();
    button.dataset.type = 'place';

    const name = place.displayName?.text || 'Unknown Place';
    const address = place.formattedAddress || '';

    // Get photo if available
    let photoHTML = '';
    if (place.photos && place.photos.length > 0 && googlePlacesApiKey) {
      const photoName = place.photos[0].name;
      const photoUrl = `https://places.googleapis.com/v1/${photoName}/media?key=${googlePlacesApiKey}&maxHeightPx=96&maxWidthPx=96`;
      photoHTML = `<img src="${photoUrl}" alt="${name}" class="location-photo">`;
    } else {
      // Placeholder for places without photos
      photoHTML = '<div class="location-photo-placeholder">📍</div>';
    }

    button.innerHTML = `
      ${photoHTML}
      <div class="location-text">
        <div class="location-name">${name}</div>
        <div class="location-address">${address}</div>
      </div>
      <div class="location-checkmark">✓</div>
    `;

    button.addEventListener('click', () => {
      console.log('Place button clicked!', place);
      selectPlace(place, button);
    });
    container.appendChild(button);
    addDebugInfo(`Added place button for: ${name}`);
  });

  // Add "Use my coordinates" option (only if we have location)
  if (hasLocation && userCoordinates) {
    const coordButton = document.createElement('button');
    coordButton.type = 'button';
    coordButton.className = 'location-option';
    coordButton.dataset.type = 'coordinates';
    coordButton.innerHTML = `
      <div class="location-photo-placeholder">📍</div>
      <div class="location-text">
        <div class="location-name">Use my coordinates</div>
        <div class="location-address">${userCoordinates.latitude.toFixed(6)}, ${userCoordinates.longitude.toFixed(6)}</div>
      </div>
      <div class="location-checkmark">✓</div>
    `;
    coordButton.addEventListener('click', () => selectCoordinates(coordButton));
    container.appendChild(coordButton);
  }

  // Only show manual entry options if we have location
  // Otherwise just show "None"
  if (hasLocation) {
    // Use reverse geocoded data if available, otherwise show generic labels
    const city = userLocationData?.city || '';
    const state = userLocationData?.state || '';
    const country = userLocationData?.country || '';

    const manualOptions = [
      {
        label: city && state && country ? `${city}, ${state}, ${country}` : 'City, State, Country',
        type: 'city-state-country',
        icon: '🏙️'
      },
      {
        label: state && country ? `${state}, ${country}` : 'State, Country',
        type: 'state-country',
        icon: '🗺️'
      },
      {
        label: 'None (no location)',
        type: 'none',
        icon: '🚫'
      },
    ];

    manualOptions.forEach(option => {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'location-option';
      button.dataset.type = option.type;
      button.innerHTML = `
        <div class="location-photo-placeholder">${option.icon}</div>
        <div class="location-text">
          <div class="location-name">${option.label}</div>
        </div>
        <div class="location-checkmark">✓</div>
      `;
      button.addEventListener('click', () => selectManualOption(option.type, button));
      container.appendChild(button);
    });
  } else {
    // No location - only show "None" option
    const noneButton = document.createElement('button');
    noneButton.type = 'button';
    noneButton.className = 'location-option';
    noneButton.dataset.type = 'none';
    noneButton.innerHTML = `
      <div class="location-photo-placeholder">🚫</div>
      <div class="location-text">
        <div class="location-name">None (no location)</div>
      </div>
      <div class="location-checkmark">✓</div>
    `;
    noneButton.addEventListener('click', () => selectManualOption('none', noneButton));
    container.appendChild(noneButton);
  }
}

// Select a place from Google Places results
function selectPlace(place: any, button: HTMLButtonElement): void {
  console.log('selectPlace() called', place);
  addDebugInfo(`selectPlace() called for: ${place.displayName?.text || 'Unknown'}`);

  // Remove selected class from all location options
  document.querySelectorAll('.location-option').forEach(btn => {
    btn.classList.remove('selected');
  });

  // Add selected class to clicked button
  button.classList.add('selected');
  addDebugInfo(`Selection applied to button`);

  const name = place.displayName?.text || 'Unknown Place';
  const address = place.formattedAddress || '';
  const lat = place.location?.latitude || 0;
  const lng = place.location?.longitude || 0;
  const addressParts = parseAddressComponents(place);

  // Store selection in form
  const form = document.getElementById('upload-form') as HTMLFormElement;
  if (form) {
    form.dataset.selectedLocation = JSON.stringify({
      venue_name: name,
      latitude: lat,
      longitude: lng,
      formatted_address: address,
      ...addressParts,
    });
  }
}

// Select coordinates option
function selectCoordinates(button: HTMLButtonElement): void {
  if (!userCoordinates) return;

  // Remove selected class from all location options
  document.querySelectorAll('.location-option').forEach(btn => {
    btn.classList.remove('selected');
  });

  // Add selected class to clicked button
  button.classList.add('selected');

  const form = document.getElementById('upload-form') as HTMLFormElement;
  if (form) {
    form.dataset.selectedLocation = JSON.stringify({
      venue_name: 'Current Location',
      latitude: userCoordinates.latitude,
      longitude: userCoordinates.longitude,
      formatted_address: `${userCoordinates.latitude.toFixed(6)}, ${userCoordinates.longitude.toFixed(6)}`,
      street: '',
      city: '',
      state: '',
      postal_code: '',
      country: '',
    });
  }
}

// Select manual entry option
function selectManualOption(type: string, button: HTMLButtonElement): void {
  // Remove selected class from all location options
  document.querySelectorAll('.location-option').forEach(btn => {
    btn.classList.remove('selected');
  });

  // Add selected class to clicked button
  button.classList.add('selected');

  const form = document.getElementById('upload-form') as HTMLFormElement;
  if (form) {
    if (type === 'none') {
      form.dataset.selectedLocation = JSON.stringify({ type: 'none' });
    } else {
      // Use reverse geocoded data if available, otherwise empty strings
      const city = userLocationData?.city || '';
      const state = userLocationData?.state || '';
      const country = userLocationData?.country || '';

      // Build location data based on type
      const locationData: any = { type };

      if (type === 'city-state-country') {
        locationData.city = city;
        locationData.state = state;
        locationData.country = country;
      } else if (type === 'state-country') {
        locationData.state = state;
        locationData.country = country;
      }

      form.dataset.selectedLocation = JSON.stringify(locationData);
    }
  }
}

// Upload data to API
async function uploadData(payload: UploadRequest): Promise<void> {
  if (!authToken) {
    throw new Error('Authentication token not available');
  }

  const response = await fetch('/upload', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${authToken}`,
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || 'Upload failed');
  }

  return response.json();
}

// Show error message
function showError(message: string): void {
  const errorDiv = document.getElementById('error-message');
  if (errorDiv) {
    errorDiv.textContent = message;
    errorDiv.style.display = 'block';
  }
}

// Show success message
function showSuccess(message: string): void {
  const successDiv = document.getElementById('success-message');
  if (successDiv) {
    successDiv.textContent = message;
    successDiv.style.display = 'block';
    setTimeout(() => {
      successDiv.style.display = 'none';
    }, 5000);
  }
}

// Handle form submission
async function handleFormSubmit(event: Event): Promise<void> {
  event.preventDefault();

  const form = event.target as HTMLFormElement;
  const formData = new FormData(form);

  const contentType = formData.get('content-type') as string;
  const title = (formData.get('title') as string) || null;
  const content = formData.get('content') as string;
  const publish = formData.get('publish') === 'on';

  if (!content) {
    showError('Content is required');
    return;
  }

  const selectedLocationJson = form.dataset.selectedLocation;
  let locationData: any = null;

  if (selectedLocationJson) {
    locationData = JSON.parse(selectedLocationJson);
  }

  const now = new Date();
  const datetime = now.toISOString();
  const date = now.toISOString().split('T')[0];

  let payload: UploadRequest;

  if (contentType === 'checkins') {
    if (!locationData || locationData.type) {
      showError('Checkins require a specific location selection');
      return;
    }

    payload = {
      type: 'checkins',
      data: {
        venue_name: locationData.venue_name,
        latitude: locationData.latitude,
        longitude: locationData.longitude,
        formatted_address: locationData.formatted_address,
        street: locationData.street,
        city: locationData.city,
        state: locationData.state,
        postal_code: locationData.postal_code,
        country: locationData.country,
        datetime,
        publish,
      },
    };
  } else {
    // chatter
    const chatterData: ChatterData = {
      title,
      content,
      date,
      date_posted: datetime,
      tags: ['chatter'],
      images: [],
      publish,
    };

    // Add optional location for chatter
    if (locationData && !locationData.type) {
      chatterData.venue_name = locationData.venue_name;
      chatterData.latitude = locationData.latitude;
      chatterData.longitude = locationData.longitude;
      chatterData.formatted_address = locationData.formatted_address;
      chatterData.street = locationData.street;
      chatterData.city = locationData.city;
      chatterData.state = locationData.state;
      chatterData.postal_code = locationData.postal_code;
      chatterData.country = locationData.country;
    }

    payload = {
      type: 'chatter',
      data: chatterData,
    };
  }

  try {
    const submitButton = form.querySelector('button[type="submit"]') as HTMLButtonElement;
    if (submitButton) {
      submitButton.disabled = true;
      submitButton.textContent = 'Uploading...';
    }

    await uploadData(payload);
    showSuccess('Upload successful!');

    // Reset form
    form.reset();
    form.dataset.selectedLocation = '';
    const selectedLocationDiv = document.getElementById('selected-location');
    if (selectedLocationDiv) {
      selectedLocationDiv.innerHTML = '';
    }

    if (submitButton) {
      submitButton.disabled = false;
      submitButton.textContent = 'Upload';
    }
  } catch (error) {
    showError((error as Error).message);
    const submitButton = form.querySelector('button[type="submit"]') as HTMLButtonElement;
    if (submitButton) {
      submitButton.disabled = false;
      submitButton.textContent = 'Upload';
    }
  }
}

// Retry getting location
async function retryLocation(): Promise<void> {
  const statusDiv = document.getElementById('status');
  const errorDiv = document.getElementById('error-message');
  const retryButton = document.getElementById('retry-location-btn');

  if (statusDiv) {
    statusDiv.textContent = 'Getting your location...';
    statusDiv.style.display = 'block';
  }

  if (errorDiv) {
    errorDiv.style.display = 'none';
  }

  if (retryButton) {
    retryButton.style.display = 'none';
  }

  try {
    userCoordinates = await getUserLocation();

    if (statusDiv) {
      statusDiv.textContent = 'Loading nearby places...';
    }

    // Fetch nearby places
    let places: any[] = [];
    if (userCoordinates && googlePlacesApiKey) {
      try {
        places = await fetchNearbyPlaces(userCoordinates);
        // Extract location data from the first place with good address data
        extractLocationFromPlaces(places);
      } catch (error) {
        console.error('Places fetch error:', error);
      }
    }

    displayLocationOptions(places, true);

    // Fetch environmental data and populate content
    if (userCoordinates) {
      await fetchEnvironmentalData(userCoordinates);
    }

    if (statusDiv) {
      statusDiv.textContent = '';
      statusDiv.style.display = 'none';
    }

    // Update button to green "enabled" state
    updateLocationButtonState(true);

    showSuccess('Location updated successfully!');
  } catch (error) {
    console.error('Retry location error:', error);

    let message = 'Could not get your location. Please try again.';
    if (error instanceof GeolocationPositionError) {
      console.error('Retry - Error code:', error.code);
      console.error('Retry - Error message:', error.message);
      message = getLocationErrorMessage(error) + ` (Error code: ${error.code})`;
    } else {
      console.error('Retry - Unknown error type:', error);
    }

    showError(message);
    displayLocationOptions([], false);

    if (statusDiv) {
      statusDiv.textContent = '';
      statusDiv.style.display = 'none';
    }

    // Reset button to red "request" state
    updateLocationButtonState(false);

    if (retryButton) {
      retryButton.style.display = 'block';
    }
  }
}

// Update button state based on location permission
function updateLocationButtonState(hasLocation: boolean): void {
  const requestButton = document.getElementById('request-location-btn');
  if (!requestButton) return;

  if (hasLocation) {
    requestButton.textContent = '✅ Location Permission Enabled';
    requestButton.className = 'request-location-button has-permission';
    (requestButton as HTMLButtonElement).disabled = true;
  } else {
    requestButton.textContent = '📍 Request Location Permission';
    requestButton.className = 'request-location-button';
    (requestButton as HTMLButtonElement).disabled = false;
  }
}

// Request location permission (explicit user action)
async function requestLocationPermission(): Promise<void> {
  const statusDiv = document.getElementById('status');
  const errorDiv = document.getElementById('error-message');
  const requestButton = document.getElementById('request-location-btn');

  if (requestButton) {
    requestButton.textContent = '⏳ Requesting location...';
    (requestButton as HTMLButtonElement).disabled = true;
  }

  if (statusDiv) {
    statusDiv.textContent = 'Requesting location permission...';
    statusDiv.style.display = 'block';
  }

  if (errorDiv) {
    errorDiv.style.display = 'none';
  }

  try {
    userCoordinates = await getUserLocation();

    if (statusDiv) {
      statusDiv.textContent = 'Loading nearby places...';
    }

    // Fetch nearby places
    let places: any[] = [];
    if (userCoordinates && googlePlacesApiKey) {
      try {
        places = await fetchNearbyPlaces(userCoordinates);
        // Extract location data from the first place with good address data
        extractLocationFromPlaces(places);
      } catch (error) {
        console.error('Places fetch error:', error);
      }
    }

    displayLocationOptions(places, true);

    // Fetch environmental data and populate content
    if (userCoordinates) {
      await fetchEnvironmentalData(userCoordinates);
    }

    if (statusDiv) {
      statusDiv.textContent = '';
      statusDiv.style.display = 'none';
    }

    // Update button to green "enabled" state
    updateLocationButtonState(true);

    showSuccess('Location permission granted! Nearby places loaded.');
  } catch (error) {
    console.error('Request location error:', error);

    let message = 'Could not get your location.';
    if (error instanceof GeolocationPositionError) {
      console.error('Request - Error code:', error.code);
      console.error('Request - Error message:', error.message);
      message = getLocationErrorMessage(error) + ` (Error code: ${error.code})`;
    } else {
      console.error('Request - Unknown error type:', error);
    }

    showError(message);
    displayLocationOptions([], false);

    if (statusDiv) {
      statusDiv.textContent = '';
      statusDiv.style.display = 'none';
    }

    // Reset button to red "request" state
    updateLocationButtonState(false);

    // Also show retry button
    const retryButton = document.getElementById('retry-location-btn');
    if (retryButton) {
      retryButton.style.display = 'block';
    }
  }
}

// Parse coordinates from clipboard text
function parseCoordinates(text: string): { lat: number; lng: number } | null {
  // Remove extra whitespace and newlines
  let cleaned = text.trim().replace(/\n/g, ' ');

  addDebugInfo(`Original: "${text}"`);

  // Check if this is Apple Maps format with degree symbols and cardinal directions
  // Examples: "37.7749°N, 122.4194°W" or "37.7749° N, 122.4194° W"
  const applePattern = /(\d+\.?\d*)°?\s*([NS])\s*,?\s*(\d+\.?\d*)°?\s*([EW])/i;
  const appleMatch = cleaned.match(applePattern);

  if (appleMatch) {
    addDebugInfo('Detected Apple Maps format with cardinal directions');

    let lat = parseFloat(appleMatch[1]);
    const latDir = appleMatch[2].toUpperCase();
    let lng = parseFloat(appleMatch[3]);
    const lngDir = appleMatch[4].toUpperCase();

    // Apply direction (S = negative latitude, W = negative longitude)
    if (latDir === 'S') {
      lat = -lat;
    }
    if (lngDir === 'W') {
      lng = -lng;
    }

    addDebugInfo(`Parsed Apple format: lat=${lat}, lng=${lng}`);

    if (!isNaN(lat) && !isNaN(lng)) {
      return { lat, lng };
    }
  }

  // Strip out degree symbols, quotes, and cardinal directions for simpler formats
  cleaned = cleaned.replace(/[°'"″′]/g, ''); // Remove degree, minute, second symbols
  cleaned = cleaned.replace(/\s*[NSEW]\s*/gi, ' '); // Remove cardinal directions
  cleaned = cleaned.trim();

  addDebugInfo(`Cleaned: "${cleaned}"`);

  // Try various simple formats:
  // "37.7749, -122.4194" (comma-separated with space)
  // "37.7749,-122.4194" (comma-separated no space)
  // "37.7749 -122.4194" (space-separated)

  const patterns = [
    /^(-?\d+\.?\d*)\s*,\s*(-?\d+\.?\d*)$/, // comma-separated
    /^(-?\d+\.?\d*)\s+(-?\d+\.?\d*)$/, // space-separated
  ];

  for (const pattern of patterns) {
    const match = cleaned.match(pattern);
    if (match) {
      const lat = parseFloat(match[1]);
      const lng = parseFloat(match[2]);

      addDebugInfo(`Matched simple format: lat=${lat}, lng=${lng}`);

      if (!isNaN(lat) && !isNaN(lng)) {
        return { lat, lng };
      }
    }
  }

  addDebugInfo('No pattern matched');
  return null;
}

// Handle paste coordinates from clipboard
async function pasteCoordinatesFromClipboard(): Promise<void> {
  try {
    addDebugInfo('Reading from clipboard...');

    // Read clipboard
    const text = await navigator.clipboard.readText();
    addDebugInfo(`Clipboard content: "${text}"`);

    // Parse coordinates
    const coords = parseCoordinates(text);

    if (!coords) {
      showError(`Could not parse coordinates from clipboard. Found: "${text}". Expected format: "37.7749, -122.4194"`);
      addDebugInfo('Failed to parse coordinates');
      return;
    }

    // Validate ranges
    if (coords.lat < -90 || coords.lat > 90) {
      showError(`Latitude must be between -90 and 90. Got: ${coords.lat}`);
      return;
    }

    if (coords.lng < -180 || coords.lng > 180) {
      showError(`Longitude must be between -180 and 180. Got: ${coords.lng}`);
      return;
    }

    addDebugInfo(`Parsed coordinates: ${coords.lat}, ${coords.lng}`);

    userCoordinates = { latitude: coords.lat, longitude: coords.lng };

    // Hide the yellow paste box and show mini-map
    const manualCoordsForm = document.getElementById('manual-coords-form');
    const miniMapContainer = document.getElementById('mini-map-container');
    const miniMapImg = document.getElementById('mini-map-img') as HTMLImageElement;

    if (manualCoordsForm) {
      manualCoordsForm.style.display = 'none';
    }

    if (miniMapContainer && miniMapImg && googlePlacesApiKey) {
      // Create Google Maps Static API URL
      const mapUrl = `https://maps.googleapis.com/maps/api/staticmap?center=${coords.lat},${coords.lng}&zoom=14&size=600x240&scale=2&markers=color:red|${coords.lat},${coords.lng}&key=${googlePlacesApiKey}`;
      miniMapImg.src = mapUrl;
      miniMapImg.onerror = () => {
        addDebugInfo(`Mini-map failed to load. API key may not have Static Maps API enabled.`);
        // Hide mini-map if it fails to load
        miniMapContainer.style.display = 'none';
      };
      miniMapContainer.style.display = 'block';
      addDebugInfo(`Mini-map URL: ${mapUrl.substring(0, 100)}...`);
    }

    const statusDiv = document.getElementById('status');
    if (statusDiv) {
      statusDiv.textContent = 'Loading nearby places...';
      statusDiv.style.display = 'block';
    }

    // Fetch nearby places
    let places: any[] = [];
    if (googlePlacesApiKey) {
      try {
        places = await fetchNearbyPlaces(userCoordinates);
        // Extract location data from the first place with good address data
        extractLocationFromPlaces(places);
      } catch (error) {
        console.error('Places fetch error:', error);
      }
    }

    displayLocationOptions(places, true);

    // Fetch environmental data and populate content
    await fetchEnvironmentalData(userCoordinates);

    if (statusDiv) {
      statusDiv.textContent = '';
      statusDiv.style.display = 'none';
    }

    // Update button to green "enabled" state
    updateLocationButtonState(true);

    showSuccess(`Using coordinates: ${coords.lat}, ${coords.lng}`);
  } catch (error) {
    console.error('Clipboard error:', error);
    addDebugInfo(`Clipboard error: ${error}`);
    showError('Could not read from clipboard. Make sure you copied coordinates first.');
  }
}

// Initialize the PWA
async function init(): Promise<void> {
  try {
    // Show loading state
    const statusDiv = document.getElementById('status');
    if (statusDiv) {
      statusDiv.textContent = 'Authenticating...';
    }

    // Fetch tokens
    await fetchTokens();

    // Check for lat/lon in URL query parameters
    const urlParams = new URLSearchParams(window.location.search);
    const lat = urlParams.get('lat');
    const lon = urlParams.get('lon');

    if (lat && lon) {
      const latitude = parseFloat(lat);
      const longitude = parseFloat(lon);

      if (!isNaN(latitude) && !isNaN(longitude) &&
          latitude >= -90 && latitude <= 90 &&
          longitude >= -180 && longitude <= 180) {
        addDebugInfo(`URL params detected: lat=${latitude}, lon=${longitude}`);

        if (statusDiv) {
          statusDiv.textContent = 'Loading location from URL...';
          statusDiv.style.display = 'block';
        }

        userCoordinates = { latitude, longitude };

        // Hide the yellow paste box and show mini-map
        const manualCoordsForm = document.getElementById('manual-coords-form');
        const miniMapContainer = document.getElementById('mini-map-container');
        const miniMapImg = document.getElementById('mini-map-img') as HTMLImageElement;

        if (manualCoordsForm) {
          manualCoordsForm.style.display = 'none';
        }

        if (miniMapContainer && miniMapImg && googlePlacesApiKey) {
          // Create Google Maps Static API URL
          const mapUrl = `https://maps.googleapis.com/maps/api/staticmap?center=${latitude},${longitude}&zoom=14&size=600x240&scale=2&markers=color:red|${latitude},${longitude}&key=${googlePlacesApiKey}`;
          miniMapImg.src = mapUrl;
          miniMapImg.onerror = () => {
            addDebugInfo(`Mini-map failed to load. API key may not have Static Maps API enabled.`);
            // Hide mini-map if it fails to load
            miniMapContainer.style.display = 'none';
          };
          miniMapContainer.style.display = 'block';
          addDebugInfo(`Mini-map displayed for URL params at: ${latitude}, ${longitude}`);
        }

        // Fetch nearby places
        let places: any[] = [];
        if (googlePlacesApiKey) {
          try {
            places = await fetchNearbyPlaces(userCoordinates);
            // Extract location data from the first place with good address data
            extractLocationFromPlaces(places);
          } catch (error) {
            console.error('Places fetch error:', error);
          }
        }

        displayLocationOptions(places, true);

        // Fetch environmental data and populate content
        await fetchEnvironmentalData(userCoordinates);

        updateLocationButtonState(true);

        if (statusDiv) {
          statusDiv.textContent = '';
          statusDiv.style.display = 'none';
        }

        showSuccess(`Location loaded from URL: ${latitude.toFixed(6)}, ${longitude.toFixed(6)}`);
        return;
      } else {
        addDebugInfo(`Invalid lat/lon in URL params: lat=${lat}, lon=${lon}`);
      }
    }

    if (statusDiv) {
      statusDiv.textContent = 'Ready! Tap the button below to enable location.';
    }

    // Don't auto-request location - wait for user to tap button
    // Show "None" option by default
    displayLocationOptions([], false);

    if (statusDiv) {
      statusDiv.style.display = 'none';
    }

    // Set up form submission
    const form = document.getElementById('upload-form');
    if (form) {
      form.addEventListener('submit', handleFormSubmit);
    }

    // Set up retry button
    const retryButton = document.getElementById('retry-location-btn');
    if (retryButton) {
      retryButton.addEventListener('click', retryLocation);
    }

    // Set up request location button
    const requestButton = document.getElementById('request-location-btn');
    if (requestButton) {
      requestButton.addEventListener('click', requestLocationPermission);
    }

    // Set up paste coordinates button
    const pasteButton = document.getElementById('paste-coords-btn');
    if (pasteButton) {
      pasteButton.addEventListener('click', pasteCoordinatesFromClipboard);
    }
  } catch (error) {
    console.error('Initialization error:', error);
    showError('Failed to initialize PWA. Please refresh the page.');
  }
}

// Register service worker
if ('serviceWorker' in navigator) {
  navigator.serviceWorker
    .register('/sw.js')
    .then(registration => {
      console.log('Service Worker registered:', registration);
    })
    .catch(error => {
      console.error('Service Worker registration failed:', error);
    });
}

// Start initialization when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
