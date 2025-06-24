import os
import json
import openai
from dotenv import load_dotenv
load_dotenv()


client = openai.OpenAI(api_key=os.getenv("OPENAI_API_KEY"))

def get_openai_response(user_input, location=None, profile=None):
    system_prompt = (
        "You are a friendly, knowledgeable local city guide. "
        "Given a user request, return ONLY a JSON array of the most relevant place names (in order) for their day, with no extra text. "
        "Do not include directions or explanations. "
        "Example: [\"Sagrada Familia\", \"Park Güell\", \"Barceloneta Beach\"]"
    )

    if location:
        system_prompt += f"\nCurrent location: {location}"
    if profile:
        system_prompt += f"\nUser preferences: {profile}"

    response = client.chat.completions.create(
        model="gpt-4o",  # or "gpt-3.5-turbo"
        messages=[
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": user_input}
        ],
        temperature=0.7
    )
    content = response.choices[0].message.content
    try:
        places = json.loads(content)
        if isinstance(places, list):
            return places
        else:
            return []
    except Exception:
        return []

def get_route_summary(request_info, places, walking_info):
    prompt = (
        "Summarise this day’s walking tour as if you were writing a friendly intro paragraph in a travel guidebook.\n"
        f"Request: {request_info}\n"
        f"Places: {json.dumps(places)}\n"
        f"Walking info: {json.dumps(walking_info)}"
    )
    response = client.chat.completions.create(
        model="gpt-4o",
        messages=[
            {"role": "system", "content": "You are a friendly, knowledgeable travel guidebook writer."},
            {"role": "user", "content": prompt}
        ],
        temperature=0.7
    )
    return response.choices[0].message.content
