from flask import Flask, request, jsonify
from openai_utils import get_openai_response, get_route_summary
from geocode_utils import geocode_places
from directions_utils import get_walking_distances
from dotenv import load_dotenv
from flask_cors import CORS

import os

load_dotenv()
app = Flask(__name__)
CORS(app)

@app.route("/chat", methods=["POST"])
def chat():
    data = request.json
    user_input = data.get("message")
    location = data.get("location", "")
    profile = data.get("profile", "")

    places = get_openai_response(user_input, location, profile)
    if not places:
        return jsonify({"error": "No places found for your request."}), 200
    # Always include the user's current location as the first stop
    geocoded = geocode_places(places, city=location, start_location=location)
    return jsonify({"places": geocoded})

@app.route("/walking_distances", methods=["POST"])
def walking_distances():
    data = request.json
    places = data.get("places", [])
    if not places or len(places) < 2:
        return jsonify({"error": "At least two places required."}), 400
    result = get_walking_distances(places)
    return jsonify(result)

@app.route("/route_summary", methods=["POST"])
def route_summary():
    data = request.json
    request_info = data.get("request_info", "")
    places = data.get("places", [])
    walking_info = data.get("walking_info", {})
    summary = get_route_summary(request_info, places, walking_info)
    return jsonify({"summary": summary})

import os

if __name__ == "__main__":
    port = int(os.environ.get("PORT", 5000))
    app.run(host="0.0.0.0", port=port)
