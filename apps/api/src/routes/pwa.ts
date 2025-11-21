import { PWA_HTML_TEMPLATE } from '../templates/pwa-template';

const PWA_STYLES = `
  * {
    box-sizing: border-box;
  }

  body {
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, sans-serif;
    font-size: 18px;
    line-height: 1.5;
    margin: 0;
    padding: 1rem;
    max-width: 600px;
    margin: 0 auto;
  }

  h1 {
    font-size: 24px;
    margin: 1rem 0;
  }

  button {
    font-size: 18px;
    padding: 14px 20px;
    min-height: 48px;
    width: 100%;
    margin: 0.5rem 0;
    border: 2px solid #333;
    background: white;
    cursor: pointer;
    border-radius: 8px;
    font-weight: 500;
  }

  button:active {
    background: #f0f0f0;
  }

  button.primary {
    background: #0066cc;
    color: white;
    border-color: #0066cc;
  }

  button.primary:active {
    background: #0052a3;
  }

  .place-option {
    text-align: left;
    border: 3px solid #ddd;
    padding: 12px;
  }

  .place-option.selected {
    border-color: #0066cc;
    background: #e6f2ff;
  }

  .place-name {
    font-weight: 600;
    font-size: 18px;
  }

  .place-address {
    font-size: 14px;
    color: #666;
    margin-top: 4px;
  }

  input, textarea {
    font-size: 18px;
    padding: 12px;
    width: 100%;
    border: 2px solid #ddd;
    border-radius: 8px;
    margin: 0.5rem 0;
  }

  label {
    display: block;
    font-weight: 600;
    margin-top: 1rem;
  }

  #status, #error {
    padding: 12px;
    margin: 1rem 0;
    border-radius: 8px;
    text-align: center;
  }

  #status {
    background: #f0f0f0;
  }

  #error {
    background: #fee;
    color: #c00;
    display: none;
  }

  #places {
    margin: 1rem 0;
  }

  .hidden {
    display: none;
  }
`;

const PWA_SCRIPT = `
let authToken = null;
let googleApiKey = null;
let selectedPlace = null;
let userCoords = null;

// Fetch auth tokens
async function init() {
  try {
    const response = await fetch('/api/token');
    if (!response.ok) throw new Error('Auth failed');
    const data = await response.json();
    authToken = data.authToken;
    googleApiKey = data.googlePlacesApiKey;

    // Check for lat/lon in URL
    const params = new URLSearchParams(window.location.search);
    const lat = parseFloat(params.get('lat'));
    const lon = parseFloat(params.get('lon'));

    if (!isNaN(lat) && !isNaN(lon)) {
      userCoords = { lat, lon };
      loadPlaces(lat, lon);
    } else {
      // Check if we already have location permission
      if ('permissions' in navigator) {
        try {
          const result = await navigator.permissions.query({ name: 'geolocation' });
          if (result.state === 'granted') {
            // Auto-enable location if already granted
            requestLocation();
            return;
          }
        } catch (e) {
          // Permissions API may not work in all browsers, continue normally
        }
      }
      document.getElementById('status').textContent = 'Tap button to enable location';
    }
  } catch (error) {
    showError('Failed to initialize. Please refresh.');
  }
}

// Request location permission
async function requestLocation() {
  document.getElementById('status').textContent = 'Getting location...';

  try {
    const position = await new Promise((resolve, reject) => {
      navigator.geolocation.getCurrentPosition(resolve, reject, {
        enableHighAccuracy: true,
        timeout: 10000
      });
    });

    userCoords = {
      lat: position.coords.latitude,
      lon: position.coords.longitude
    };

    loadPlaces(userCoords.lat, userCoords.lon);
  } catch (error) {
    showError('Location permission denied or unavailable');
  }
}

// Load nearby places from Google Places API
async function loadPlaces(lat, lon) {
  document.getElementById('status').textContent = 'Finding nearby places...';

  try {
    const url = 'https://places.googleapis.com/v1/places:searchNearby';
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Goog-Api-Key': googleApiKey,
        'X-Goog-FieldMask': 'places.displayName,places.formattedAddress,places.location'
      },
      body: JSON.stringify({
        locationRestriction: {
          circle: {
            center: { latitude: lat, longitude: lon },
            radius: 500
          }
        },
        maxResultCount: 10
      })
    });

    if (!response.ok) throw new Error('Places API failed');

    const data = await response.json();
    const places = data.places || [];

    await displayPlaces(places, lat, lon);
    document.getElementById('status').classList.add('hidden');
  } catch (error) {
    showError('Failed to load nearby places');
  }
}

// Reverse geocode to get city and state
async function getCityState(lat, lon) {
  try {
    const url = \`https://maps.googleapis.com/maps/api/geocode/json?latlng=\${lat},\${lon}&key=\${googleApiKey}\`;
    const response = await fetch(url);
    if (!response.ok) return 'City, State';

    const data = await response.json();
    if (data.error_message) return 'City, State';
    if (!data.results || data.results.length === 0) return 'City, State';

    const components = data.results[0].address_components;
    let city = '';
    let state = '';

    for (const component of components) {
      if (component.types.includes('locality')) {
        city = component.long_name;
      } else if (component.types.includes('sublocality') && !city) {
        city = component.long_name;
      }
      if (component.types.includes('administrative_area_level_1')) {
        state = component.short_name;
      }
    }

    if (city && state) {
      return \`\${city}, \${state}\`;
    }
    return 'City, State';
  } catch (error) {
    return 'City, State';
  }
}

// Display places list
async function displayPlaces(places, lat, lon) {
  const container = document.getElementById('places');
  container.innerHTML = '';

  // Add nearby places
  places.forEach(place => {
    const button = document.createElement('button');
    button.className = 'place-option';
    button.innerHTML = \`
      <div class="place-name">\${place.displayName?.text || 'Unknown'}</div>
      <div class="place-address">\${place.formattedAddress || ''}</div>
    \`;
    button.onclick = () => selectPlace(place, button);
    container.appendChild(button);
  });

  // Get real city and state
  const cityState = await getCityState(lat, lon);

  // Add "City, State" option (default selected)
  const cityStateButton = document.createElement('button');
  cityStateButton.className = 'place-option selected';
  cityStateButton.innerHTML = \`<div class="place-name">\${cityState}</div>\`;
  cityStateButton.onclick = () => selectCityState(cityStateButton);
  container.appendChild(cityStateButton);

  // Add "No location" option
  const noLocationButton = document.createElement('button');
  noLocationButton.className = 'place-option';
  noLocationButton.innerHTML = '<div class="place-name">No location</div>';
  noLocationButton.onclick = () => selectNoLocation(noLocationButton);
  container.appendChild(noLocationButton);

  // Set City, State as default selection
  selectedPlace = {
    type: 'city_state',
    location: { lat, lon }
  };

  document.getElementById('location-btn').classList.add('hidden');
}

// Select a place
function selectPlace(place, button) {
  document.querySelectorAll('.place-option').forEach(b => b.classList.remove('selected'));
  button.classList.add('selected');

  selectedPlace = {
    type: 'place',
    name: place.displayName?.text || 'Unknown',
    address: place.formattedAddress || '',
    location: {
      lat: place.location?.latitude || 0,
      lon: place.location?.longitude || 0
    }
  };
}

// Select City, State option
function selectCityState(button) {
  document.querySelectorAll('.place-option').forEach(b => b.classList.remove('selected'));
  button.classList.add('selected');

  selectedPlace = {
    type: 'city_state',
    location: userCoords
  };
}

// Select No location option
function selectNoLocation(button) {
  document.querySelectorAll('.place-option').forEach(b => b.classList.remove('selected'));
  button.classList.add('selected');

  selectedPlace = null;
}

// Submit form
async function submitForm(e) {
  e.preventDefault();

  const title = document.getElementById('title').value.trim();
  const content = document.getElementById('content').value.trim();

  if (!content) {
    showError('Content is required');
    return;
  }

  document.getElementById('status').textContent = 'Creating post...';
  document.getElementById('status').classList.remove('hidden');

  try {
    const payload = {
      kind: 'chatter',
      content,
      date_posted: new Date().toISOString(),
      publish: true
    };

    if (title) payload.title = title;

    if (selectedPlace) {
      payload.location_hint = {
        lat: selectedPlace.location.lat,
        lng: selectedPlace.location.lon,
        accuracy_m: 50
      };

      if (selectedPlace.type === 'place') {
        payload.place = {
          name: selectedPlace.name,
          formatted_address: selectedPlace.address,
          short_address: selectedPlace.address,
          location: {
            lat: selectedPlace.location.lat,
            lng: selectedPlace.location.lon
          }
        };
      }
    }

    const response = await fetch('/api/chatters', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + authToken
      },
      body: JSON.stringify(payload)
    });

    if (!response.ok) throw new Error('Post creation failed');

    document.getElementById('status').textContent = 'Post created!';
    document.getElementById('title').value = '';
    document.getElementById('content').value = '';

    setTimeout(() => {
      document.getElementById('status').classList.add('hidden');
    }, 3000);
  } catch (error) {
    showError('Failed to create post');
  }
}

function showError(message) {
  const errorEl = document.getElementById('error');
  errorEl.textContent = message;
  errorEl.style.display = 'block';
  document.getElementById('status').classList.add('hidden');
}

// Initialize on load
init();
`;

export function getPwaHtml(): string {
	return PWA_HTML_TEMPLATE.replace('{{STYLES}}', PWA_STYLES).replace(
		'{{SCRIPT}}',
		PWA_SCRIPT
	);
}
