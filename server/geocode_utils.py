import os
import requests

def geocode_place(place_name, api_key, city=None, use_city_context=True):
    # Only add city context if use_city_context is True and city is not an address
    query = f"{place_name}, {city}" if city and use_city_context else place_name
    url = "https://maps.googleapis.com/maps/api/geocode/json"
    params = {"address": query, "key": api_key}
    resp = requests.get(url, params=params)
    data = resp.json()
    if data.get("status") == "OK" and data["results"]:
        loc = data["results"][0]["geometry"]["location"]
        return {
            "name": place_name,
            "lat": loc["lat"],
            "lng": loc["lng"]
        }
    return {"name": place_name, "lat": None, "lng": None}


def extract_city(location):
    # Try to extract just the city name from the location string
    # e.g. '300 Stepney Way, London' -> 'London'
    if not location:
        return None
    parts = [p.strip() for p in location.split(',')]
    if len(parts) > 1:
        return parts[-1]
    return location


def geocode_places(place_names, city=None, start_location=None):
    api_key = os.getenv("GOOGLE_MAPS_API_KEY")
    if not api_key:
        raise ValueError("GOOGLE_MAPS_API_KEY not set in environment")
    results = []
    # Geocode start_location exactly as entered (no city context)
    if start_location:
        results.append(geocode_place(start_location, api_key, city, use_city_context=False))
    # Use only the city name for context
    city_name = extract_city(city)
    for name in place_names:
        results.append(geocode_place(name, api_key, city_name, use_city_context=True))
    return results
