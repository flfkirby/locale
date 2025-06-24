import { useState, useEffect, useRef } from 'react';
import './App.css';
import { GoogleMap, Marker, useJsApiLoader, DirectionsService, DirectionsRenderer } from '@react-google-maps/api';

const mapContainerStyle = {
  width: '100%',
  height: '400px',
  margin: '2rem 0',
};

const DISTANCE_OPTIONS = [
  { label: '100m', value: 100 },
  { label: '250m', value: 250 },
  { label: '500m', value: 500 },
  { label: '1km', value: 1000 },
  { label: '2km', value: 2000 },
  { label: '5km', value: 5000 },
  { label: '10km', value: 10000 },
  { label: '20km', value: 20000 },
  { label: '50km', value: 50000 },
];

// Haversine formula to calculate distance between two lat/lng points in meters
function getDistanceFromLatLonInM(lat1, lon1, lat2, lon2) {
  const R = 6371000; // Radius of the earth in m
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a =
    0.5 - Math.cos(dLat)/2 +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    (1 - Math.cos(dLon))/2;
  return R * 2 * Math.asin(Math.sqrt(a));
}

// Helper to generate a gold marker SVG with a number
function getGoldMarkerSVG(number) {
  return `data:image/svg+xml;utf8,<svg width='40' height='40' xmlns='http://www.w3.org/2000/svg'><circle cx='20' cy='20' r='18' fill='%23FFD600' stroke='%23B8860B' stroke-width='3'/><text x='20' y='26' font-size='18' font-family='Arial' font-weight='bold' text-anchor='middle' fill='%23222'>${number}</text></svg>`;
}

function App() {
  const [historicLocations, setHistoricLocations] = useState([]);
  const [search, setSearch] = useState('');
  const [distance, setDistance] = useState(500);
  const [userLocation, setUserLocation] = useState(null);
  const [nearbyIds, setNearbyIds] = useState([]);
  const [locating, setLocating] = useState(false);
  const [locationError, setLocationError] = useState('');
  const [selectedLocation, setSelectedLocation] = useState(null);
  const [routeLocations, setRouteLocations] = useState(() => {
    // Load from localStorage if available
    const saved = localStorage.getItem('myRoute');
    return saved ? JSON.parse(saved) : [];
  });
  const [directions, setDirections] = useState(null);
  const [routeError, setRouteError] = useState('');
  const [routeSummary, setRouteSummary] = useState('');
  const [summarizing, setSummarizing] = useState(false);
  const [visitedLocations, setVisitedLocations] = useState([]);
  const [routeStarted, setRouteStarted] = useState(false);
  const [arrivedIndex, setArrivedIndex] = useState(null);
  const mapRef = useRef(null);

  const GOOGLE_MAPS_API_KEY = import.meta.env.VITE_GOOGLE_MAPS_API_KEY;
  const { isLoaded } = useJsApiLoader({
    googleMapsApiKey: GOOGLE_MAPS_API_KEY,
  });

  useEffect(() => {
    fetch('/historic_locations.json')
      .then(res => res.json())
      .then(data => setHistoricLocations(data))
      .catch(() => setHistoricLocations([]));
  }, []);

  // Filter locations by name or address
  const filteredLocations = historicLocations.filter(loc =>
    loc.name.toLowerCase().includes(search.toLowerCase()) ||
    loc.address.toLowerCase().includes(search.toLowerCase())
  );

  // Find nearby locations when userLocation or distance changes
  useEffect(() => {
    if (!userLocation) {
      setNearbyIds([]);
      return;
    }
    const ids = filteredLocations
      .map((loc, idx) => ({
        idx,
        dist: getDistanceFromLatLonInM(
          userLocation.lat,
          userLocation.lng,
          loc.latitude,
          loc.longitude
        )
      }))
      .filter(obj => obj.dist <= distance)
      .map(obj => obj.idx);
    setNearbyIds(ids);
  }, [userLocation, distance, filteredLocations]);

  // Center map on user or first filtered location, or default to London
  const mapCenter = userLocation
    ? userLocation
    : filteredLocations.length > 0
      ? { lat: filteredLocations[0].latitude, lng: filteredLocations[0].longitude }
      : { lat: 51.5074, lng: -0.1278 };

  const handleFindMe = () => {
    setLocating(true);
    setLocationError('');
    if (!navigator.geolocation) {
      setLocationError('Geolocation is not supported by your browser.');
      setLocating(false);
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setUserLocation({ lat: pos.coords.latitude, lng: pos.coords.longitude });
        setLocating(false);
      },
      (err) => {
        setLocationError('Could not get your location.');
        setLocating(false);
      }
    );
  };

  // Compute distances and sort locations if userLocation is set
  let listToDisplay = userLocation
    ? filteredLocations.map((loc, idx) => {
        const dist = getDistanceFromLatLonInM(
          userLocation.lat,
          userLocation.lng,
          loc.latitude,
          loc.longitude
        );
        return { ...loc, _distance: dist };
      })
      .filter((loc, idx) => nearbyIds.includes(idx))
      .sort((a, b) => a._distance - b._distance)
    : filteredLocations;

  // Fit map to bounds of nearby locations + user location
  useEffect(() => {
    if (!mapRef.current || !userLocation || listToDisplay.length === 0) return;
    const bounds = new window.google.maps.LatLngBounds();
    bounds.extend(userLocation);
    listToDisplay.forEach(loc => {
      bounds.extend({ lat: loc.latitude, lng: loc.longitude });
    });
    mapRef.current.fitBounds(bounds, 80); // 80px padding
  }, [userLocation, listToDisplay]);

  // Sync routeLocations to localStorage
  useEffect(() => {
    localStorage.setItem('myRoute', JSON.stringify(routeLocations));
  }, [routeLocations]);

  // Add/remove location from route
  const toggleRouteLocation = (loc) => {
    setRouteLocations(prev => {
      const exists = prev.find(l => l.name === loc.name);
      if (exists) {
        return prev.filter(l => l.name !== loc.name);
      } else {
        return [...prev, loc];
      }
    });
  };
  // Remove location from route
  const removeRouteLocation = (loc) => {
    setRouteLocations(prev => prev.filter(l => l.name !== loc.name));
  };

  // Generate route when user clicks button
  const handleGenerateRoute = () => {
    if (routeLocations.length < 1 || !userLocation) return;
    setRouteError('');
    setDirections(null);
    // DirectionsService expects: origin, destination, waypoints
    // Origin is userLocation, then all routeLocations in order
    const origin = { lat: userLocation.lat, lng: userLocation.lng };
    const destination = { lat: routeLocations[routeLocations.length - 1].latitude, lng: routeLocations[routeLocations.length - 1].longitude };
    const waypoints = routeLocations.slice(0, -1).map(loc => ({ location: { lat: loc.latitude, lng: loc.longitude }, stopover: true }));
    setDirections({
      request: {
        origin,
        destination,
        waypoints,
        travelMode: 'WALKING',
        optimizeWaypoints: false
      }
    });
  };

  // Helper to build places array for summary (user location + route locations)
  const getSummaryPlaces = () => {
    if (!userLocation) return routeLocations;
    // User location as first stop
    return [
      {
        name: 'Your Location',
        description: 'This is where you will start your journey.',
        address: '',
        latitude: userLocation.lat,
        longitude: userLocation.lng,
        fun_fact: ''
      },
      ...routeLocations
    ];
  };

  // Helper to build walking info from Directions API
  const getWalkingInfo = () => {
    if (!directions || !directions.result) return {};
    const legs = directions.result.routes[0]?.legs || [];
    const segments = legs.map((leg, i) => ({
      from: getSummaryPlaces()[i]?.name || '',
      to: getSummaryPlaces()[i + 1]?.name || '',
      distance_m: leg.distance.value,
      text: leg.distance.text
    }));
    const total_distance = legs.reduce((sum, leg) => sum + leg.distance.value, 0);
    return { segments, total_distance };
  };

  // Call backend for route summary
  const handleSummarizeRoute = async () => {
    setSummarizing(true);
    setRouteSummary('');
    try {
      const res = await fetch('http://localhost:5000/route_summary', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          request_info: 'User walking tour',
          places: getSummaryPlaces(),
          walking_info: getWalkingInfo()
        })
      });
      const data = await res.json();
      setRouteSummary(data.summary || 'No summary available.');
    } catch (err) {
      setRouteSummary('Could not generate summary.');
    }
    setSummarizing(false);
  };

  // Proximity alert: watch user location and notify on arrival
  useEffect(() => {
    if (!routeStarted || !('geolocation' in navigator) || routeLocations.length === 0) return;
    let watchId;
    let permissionAsked = false;
    const arrivalRadius = 50; // meters

    function handleArrival(loc) {
      // Browser notification
      if (window.Notification && Notification.permission === 'granted') {
        new Notification(`You've arrived at ${loc.name}!`);
      } else if (window.Notification && !permissionAsked) {
        Notification.requestPermission();
        permissionAsked = true;
      }
      // Open modal
      setSelectedLocation(loc);
      // Set arrived index
      const idx = routeLocations.findIndex(l => l.name === loc.name);
      setArrivedIndex(idx);
      // Center map
      if (mapRef.current) {
        mapRef.current.panTo({ lat: loc.latitude, lng: loc.longitude });
      }
    }

    function checkProximity(pos) {
      const userLat = pos.coords.latitude;
      const userLng = pos.coords.longitude;
      routeLocations.forEach(loc => {
        if (visitedLocations.includes(loc.name)) return;
        const dist = getDistanceFromLatLonInM(userLat, userLng, loc.latitude, loc.longitude);
        if (dist <= arrivalRadius) {
          setVisitedLocations(prev => [...prev, loc.name]);
          handleArrival(loc);
        }
      });
    }

    watchId = navigator.geolocation.watchPosition(checkProximity, () => {}, { enableHighAccuracy: true });
    return () => {
      if (watchId) navigator.geolocation.clearWatch(watchId);
    };
    // eslint-disable-next-line
  }, [routeStarted, routeLocations, visitedLocations]);

  // Add handler for next location
  const handleNextLocation = () => {
    if (arrivedIndex === null) return;
    const nextIdx = routeLocations.findIndex((l, i) => i > arrivedIndex && !visitedLocations.includes(l.name));
    if (nextIdx !== -1) {
      const nextLoc = routeLocations[nextIdx];
      setSelectedLocation(nextLoc);
      setArrivedIndex(nextIdx);
      if (mapRef.current) {
        mapRef.current.panTo({ lat: nextLoc.latitude, lng: nextLoc.longitude });
      }
    } else {
      setSelectedLocation({ name: 'Route complete!', description: '', address: '', fun_fact: '', image: null });
      setArrivedIndex(null);
    }
  };

  const handleClearRoute = () => {
    setRouteLocations([]);
    setRouteStarted(false);
    setRouteSummary('');
    setDirections(null);
    setVisitedLocations([]);
    setSummarizing(false);
  };

  return (
    <div className="app" style={{ minHeight: '100vh', width: '100vw', display: 'flex', flexDirection: 'column', alignItems: 'center', margin: 0, background: '#111' }}>
      <div style={{ width: '100%', maxWidth: 800, position: 'sticky', top: 0, zIndex: 3, background: '#111', boxShadow: '0 2px 8px rgba(0,0,0,0.04)' }}>
        <h1 style={{ marginBottom: 0, padding: '1.5rem 0 0.5rem 0', color: '#fff' }}>Locale: Hidden London</h1>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 12, marginBottom: 16 }}>
          <span>Show places within</span>
          <select value={distance} onChange={e => setDistance(Number(e.target.value))} style={{ fontSize: '1rem', padding: '0.3rem 0.7rem', borderRadius: 6 }}>
            {DISTANCE_OPTIONS.map(opt => (
              <option key={opt.value} value={opt.value}>{opt.label}</option>
            ))}
          </select>
          <span>of me</span>
          <button onClick={handleFindMe} disabled={locating} style={{ marginLeft: 8, padding: '0.5rem 1rem', borderRadius: 6 }}>
            {locating ? 'Locating...' : 'Find my location'}
          </button>
        </div>
        {locationError && <div style={{ color: 'red', marginBottom: 8 }}>{locationError}</div>}
        {/* Only show map, search, and list if userLocation is set */}
        {userLocation && (
          <div style={{ width: '100%' }}>
            {isLoaded && (
              <GoogleMap
                mapContainerStyle={{ width: '100%', height: '400px', margin: '2rem 0' }}
                center={mapCenter}
                zoom={13}
                onLoad={map => (mapRef.current = map)}
              >
                {userLocation && (
                  <Marker
                    position={userLocation}
                    icon={{ url: 'http://maps.google.com/mapfiles/ms/icons/red-dot.png' }}
                    title="You are here"
                  />
                )}
                {historicLocations.map((loc) => {
                  const inRoute = routeLocations.some(l => l.name === loc.name);
                  const listIdx = listToDisplay.findIndex(l => l.name === loc.name);
                  if (inRoute && listIdx !== -1) {
                    return (
                      <Marker
                        key={loc.name}
                        position={{ lat: loc.latitude, lng: loc.longitude }}
                        icon={{ url: getGoldMarkerSVG(listIdx + 1) }}
                        title={loc.name}
                        onClick={() => setSelectedLocation(loc)}
                      />
                    );
                  } else if (listIdx !== -1) {
                    return (
                      <Marker
                        key={loc.name}
                        position={{ lat: loc.latitude, lng: loc.longitude }}
                        icon={{
                          url: nearbyIds.includes(historicLocations.indexOf(loc))
                            ? 'http://maps.google.com/mapfiles/ms/icons/green-dot.png'
                            : 'http://maps.google.com/mapfiles/ms/icons/blue-dot.png'
                        }}
                        label={{
                          text: String(listIdx + 1),
                          fontSize: '18px',
                          fontWeight: 'bold',
                          color: '#111',
                          className: 'marker-label',
                        }}
                        title={loc.name}
                        onClick={() => setSelectedLocation(loc)}
                      />
                    );
                  } else {
                    return (
                      <Marker
                        key={loc.name}
                        position={{ lat: loc.latitude, lng: loc.longitude }}
                        icon={{
                          url: inRoute
                            ? getGoldMarkerSVG('')
                            : nearbyIds.includes(historicLocations.indexOf(loc))
                              ? 'http://maps.google.com/mapfiles/ms/icons/green-dot.png'
                              : 'http://maps.google.com/mapfiles/ms/icons/blue-dot.png'
                        }}
                        title={loc.name}
                        onClick={() => setSelectedLocation(loc)}
                      />
                    );
                  }
                })}
                {/* Render route if available */}
                {directions && directions.result && (
                  <DirectionsRenderer directions={directions.result} />
                )}
                {/* Call DirectionsService if request is set and no result yet */}
                {directions && directions.request && !directions.result && (
                  <DirectionsService
                    options={directions.request}
                    callback={res => {
                      if (res && res.status === 'OK') {
                        setDirections(d => ({ ...d, result: res }));
                      } else if (res && res.status !== 'OK') {
                        setRouteError('Could not generate route.');
                        setDirections(null);
                      }
                    }}
                  />
                )}
              </GoogleMap>
            )}
            {/* Only show search and list if no route is generated */}
            {!directions && (
              <div style={{ width: '100%', display: 'flex', justifyContent: 'center', margin: '0 0 1.5rem 0' }}>
                <input
                  type="text"
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                  placeholder="Search by name or address..."
                  style={{ width: '100%', maxWidth: 400, margin: 0, padding: '0.75rem', fontSize: '1.1rem', borderRadius: 8, border: '1px solid #ccc' }}
                />
              </div>
            )}
          </div>
        )}
      </div>
      {/* Only show location list if userLocation and no route is generated */}
      {userLocation && !directions && (
        <div style={{ width: '100%', maxWidth: 800, flex: 1, overflowY: 'auto', margin: '0 auto', padding: '2rem 0' }}>
          <ul className="location-list" style={{ listStyle: 'none', padding: 0 }}>
            {listToDisplay.map((loc, idx) => {
              const inRoute = routeLocations.some(l => l.name === loc.name);
              return (
                <li
                  key={loc.name}
                  className={userLocation ? 'nearby-location' : ''}
                  style={{
                    marginBottom: '1.5rem',
                    background: inRoute ? '#fffde7' : userLocation ? '#e6ffe6' : '#f9f9f9',
                    border: inRoute ? '2px solid #ffd600' : userLocation ? '2px solid #4caf50' : 'none',
                    borderRadius: 8,
                    padding: '1rem',
                    boxShadow: '0 2px 8px rgba(0,0,0,0.04)',
                    cursor: 'pointer',
                    position: 'relative',
                    display: 'flex',
                    flexDirection: 'column',
                    justifyContent: 'flex-start',
                    overflow: 'hidden'
                  }}
                  onClick={() => setSelectedLocation(loc)}
                >
                  <button
                    onClick={e => { e.stopPropagation(); toggleRouteLocation(loc); }}
                    style={{
                      position: 'absolute',
                      top: 12,
                      right: 12,
                      background: inRoute ? '#1976d2' : '#fff',
                      color: inRoute ? '#fff' : '#1976d2',
                      border: '2px solid #1976d2',
                      borderRadius: '50%',
                      width: 32,
                      height: 32,
                      fontSize: 18,
                      fontWeight: 'bold',
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      zIndex: 2
                    }}
                    aria-label={inRoute ? 'Remove from route' : 'Add to route'}
                    title={inRoute ? 'Remove from route' : 'Add to route'}
                  >
                    ★
                  </button>
                  {loc.image && (
                    <img
                      src={`/${loc.image}`}
                      alt={loc.name}
                      style={{ height: 120, width: '50%', display: 'block', margin: '0 auto 8px auto', objectFit: 'cover', borderRadius: 8 }}
                    />
                  )}
                  <div style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'flex-start', overflow: 'hidden' }}>
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
                      <h2 style={{ margin: 0, textAlign: 'center' }}>
                        {userLocation && <span style={{ marginRight: 8, color: '#1976d2' }}>{idx + 1}.</span>}
                        {loc.name}
                      </h2>
                      {userLocation && (
                        <span style={{ color: '#888', fontSize: 14, marginTop: 2 }}>
                          {loc._distance < 1000
                            ? `${Math.round(loc._distance)} m`
                            : `${(loc._distance / 1000).toFixed(2)} km`}
                        </span>
                      )}
                    </div>
                    <p style={{ margin: '0.5rem 0 0.25rem 0', color: '#555', fontSize: 15 }}>{loc.address}</p>
                    <p style={{ margin: 0, fontSize: 15 }}>{loc.description}</p>
                    <small style={{ color: '#888', fontSize: 15 }}>Fun fact: {loc.fun_fact}</small>
                  </div>
                </li>
              );
            })}
            {listToDisplay.length === 0 && <li>No locations found.</li>}
          </ul>
        </div>
      )}
      {/* Details Modal */}
      {selectedLocation && (
        <div
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            width: '100vw',
            height: '100vh',
            background: 'rgba(0,0,0,0.5)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 3000
          }}
          onClick={() => { setSelectedLocation(null); setArrivedIndex(null); }}
        >
          <div
            className="modal-content"
            style={{
              background: '#fff',
              borderRadius: 12,
              maxWidth: 500,
              width: '90vw',
              padding: 24,
              position: 'relative',
              boxShadow: '0 4px 32px rgba(0,0,0,0.15)'
            }}
            onClick={e => e.stopPropagation()}
          >
            <button
              onClick={() => { setSelectedLocation(null); setArrivedIndex(null); }}
              style={{
                position: 'absolute',
                top: 12,
                right: 12,
                background: 'none',
                border: 'none',
                fontSize: 24,
                cursor: 'pointer',
                color: '#888'
              }}
              aria-label="Close"
            >
              ×
            </button>
            {arrivedIndex !== null && (
              <h2 style={{ marginTop: 0, color: '#43a047' }}>You have arrived at:</h2>
            )}
            <h2 style={{ marginTop: arrivedIndex !== null ? 0 : undefined }}>{selectedLocation.name}</h2>
            {selectedLocation.image && (
              <img
                src={`/${selectedLocation.image}`}
                alt={selectedLocation.name}
                style={{ width: '100%', maxWidth: 400, borderRadius: 8, marginBottom: 16, objectFit: 'cover' }}
              />
            )}
            <p style={{ color: '#555', margin: '0.5rem 0' }}>{selectedLocation.address}</p>
            <p>{selectedLocation.description}</p>
            <small style={{ color: '#888' }}>Fun fact: {selectedLocation.fun_fact}</small>
            <div style={{ marginTop: 16 }}>
              <a
                href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(selectedLocation.address)}`}
                target="_blank"
                rel="noopener noreferrer"
                style={{ color: '#1976d2', textDecoration: 'underline', fontWeight: 500 }}
              >
                Open in Google Maps
              </a>
            </div>
            {arrivedIndex !== null && (
              <button
                onClick={handleNextLocation}
                style={{
                  marginTop: 18,
                  width: '100%',
                  padding: '0.7rem',
                  background: '#1976d2',
                  color: '#fff',
                  border: 'none',
                  borderRadius: 6,
                  fontWeight: 600,
                  fontSize: 16,
                  cursor: 'pointer'
                }}
              >
                Next Location
              </button>
            )}
          </div>
        </div>
      )}
      {/* My Route Panel */}
      {routeLocations.length > 0 && (
        <div
          style={
            directions
              ? {
                  position: 'fixed',
                  top: 90,
                  left: '50%',
                  transform: 'translateX(-50%)',
                  background: '#fff',
                  color: '#111',
                  borderRadius: 12,
                  boxShadow: '0 2px 12px rgba(0,0,0,0.15)',
                  padding: '1rem 1.5rem',
                  zIndex: 2000,
                  minWidth: 220,
                  maxWidth: 350
                }
              : {
                  position: 'fixed',
                  top: 80,
                  right: 24,
                  background: '#fff',
                  color: '#111',
                  borderRadius: 12,
                  boxShadow: '0 2px 12px rgba(0,0,0,0.15)',
                  padding: '1rem 1.5rem',
                  zIndex: 2000,
                  minWidth: 220,
                  maxWidth: 350
                }
          }
        >
          <h3 style={{ marginTop: 0, marginBottom: 12, color: '#1976d2' }}>My Route</h3>
          <button
            onClick={handleClearRoute}
            style={{
              marginBottom: 12,
              width: '100%',
              padding: '0.5rem',
              background: '#d32f2f',
              color: '#fff',
              border: 'none',
              borderRadius: 6,
              fontWeight: 600,
              fontSize: 15,
              cursor: 'pointer'
            }}
          >
            Clear Route
          </button>
          <ol style={{ paddingLeft: 18, margin: 0 }}>
            {routeLocations.map((loc, idx) => {
              const visited = visitedLocations.includes(loc.name);
              return (
                <li key={loc.name} style={{ marginBottom: 8, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <span style={{ color: visited ? '#43a047' : undefined, display: 'flex', alignItems: 'center' }}>
                    {visited && <span style={{ fontSize: 18, marginRight: 6 }}>✓</span>}
                    {loc.name}
                  </span>
                  <button
                    onClick={() => removeRouteLocation(loc)}
                    style={{
                      marginLeft: 8,
                      background: 'none',
                      border: 'none',
                      color: '#d32f2f',
                      fontSize: 18,
                      cursor: 'pointer'
                    }}
                    aria-label="Remove from route"
                    title="Remove from route"
                  >
                    ×
                  </button>
                </li>
              );
            })}
          </ol>
          <button
            onClick={handleGenerateRoute}
            disabled={routeLocations.length < 1 || !userLocation}
            style={{
              marginTop: 12,
              width: '100%',
              padding: '0.5rem',
              background: '#1976d2',
              color: '#fff',
              border: 'none',
              borderRadius: 6,
              fontWeight: 600,
              fontSize: 16,
              cursor: routeLocations.length < 1 || !userLocation ? 'not-allowed' : 'pointer',
              opacity: routeLocations.length < 1 || !userLocation ? 0.6 : 1
            }}
          >
            Generate Route
          </button>
          {routeError && <div style={{ color: '#d32f2f', marginTop: 8 }}>{routeError}</div>}
          {directions && directions.result && !routeSummary && (
            <button
              onClick={handleSummarizeRoute}
              disabled={summarizing}
              style={{
                marginTop: 12,
                width: '100%',
                padding: '0.5rem',
                background: '#222',
                color: '#fff',
                border: 'none',
                borderRadius: 6,
                fontWeight: 600,
                fontSize: 16,
                cursor: summarizing ? 'not-allowed' : 'pointer',
                opacity: summarizing ? 0.6 : 1
              }}
            >
              {summarizing ? 'Summarizing...' : 'Summarize My Route'}
            </button>
          )}
          {routeSummary && !routeStarted && (
            <button
              onClick={() => setRouteStarted(true)}
              style={{
                marginTop: 12,
                width: '100%',
                padding: '0.5rem',
                background: '#43a047',
                color: '#fff',
                border: 'none',
                borderRadius: 6,
                fontWeight: 600,
                fontSize: 16,
                cursor: 'pointer'
              }}
            >
              GO!
            </button>
          )}
          {routeSummary && (
            <div style={{ marginTop: 16, background: '#f9f9f9', borderRadius: 8, padding: 12, color: '#222', fontSize: 15, whiteSpace: 'pre-line' }}>
              {routeSummary}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default App;
