import os
import requests

def get_walking_distances(places):
    """
    places: list of dicts with 'lat' and 'lng' keys
    Returns: list of dicts with segment info and total distance in meters
    """
    api_key = os.getenv("GOOGLE_MAPS_API_KEY")
    if not api_key:
        raise ValueError("GOOGLE_MAPS_API_KEY not set in environment")
    if len(places) < 2:
        return {"segments": [], "total_distance": 0}

    segments = []
    total_distance = 0
    for i in range(len(places) - 1):
        origin = f"{places[i]['lat']},{places[i]['lng']}"
        destination = f"{places[i+1]['lat']},{places[i+1]['lng']}"
        url = "https://maps.googleapis.com/maps/api/directions/json"
        params = {
            "origin": origin,
            "destination": destination,
            "mode": "walking",
            "key": api_key
        }
        resp = requests.get(url, params=params)
        data = resp.json()
        if data.get("status") == "OK" and data["routes"]:
            leg = data["routes"][0]["legs"][0]
            distance = leg["distance"]["value"]  # in meters
            segments.append({
                "from": places[i]["name"],
                "to": places[i+1]["name"],
                "distance_m": distance,
                "text": leg["distance"]["text"]
            })
            total_distance += distance
        else:
            segments.append({
                "from": places[i]["name"],
                "to": places[i+1]["name"],
                "distance_m": None,
                "text": "No route found"
            })
    return {"segments": segments, "total_distance": total_distance}
