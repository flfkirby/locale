import requests
from bs4 import BeautifulSoup
import os

locations = [
    {
        "name": "Hayes Place (birthplace)",
        "url": "https://commons.wikimedia.org/wiki/File:Site_of_Hayes_Place_(Hayes,_Kent)_blue_plaque.jpg"
    },
    {
        "name": "Holwood House grounds (Wilberforce Oak)",
        "url": "https://commons.wikimedia.org/wiki/File:Wilberforce_Seat.jpg"
    },
    {
        "name": "Blue plaque at 120 Baker Street",
        "url": "https://commons.wikimedia.org/wiki/File:Lost_Plaque_LCC_William_Pitt_The_Younger_14_York_Place_now_120_Baker_Street_1904.png"
    },
    {
        "name": "Statue of William Pitt the Younger, Hanover Square",
        "url": "https://commons.wikimedia.org/wiki/File:Statue_of_Pitt_the_Younger%2C_Hanover_Square_W1.JPG"
    },
    {
        "name": "Monument to Pitt the Younger, Westminster Abbey",
        "url": "https://commons.wikimedia.org/wiki/File:Pitt_monument%2C_Westminster_Abbey.jpg"
    },
    {
        "name": "Burial vault of the Pitts, Westminster Abbey north transept",
        "url": "https://commons.wikimedia.org/wiki/File:Monument_to_William_Pitt%2C_Earl_of_Chatham%2C_Westminster_Abbey_02.jpg"
    },
    {
        "name": "Lansdowne House (tenant site)",
        "url": "https://commons.wikimedia.org/wiki/File:Lansdowne_House._Wellcome_L0001686.jpg"
    },
    {
        "name": "Berkeley Square Plane Trees",
        "url": "https://commons.wikimedia.org/wiki/File:Berkley_Sq%2C_London_W1_%2825954583006%29.jpg"
    }
]

def download_commons_image(page_url, name):
    try:
        r = requests.get(page_url)
        soup = BeautifulSoup(r.text, 'html.parser')
        full_image_link = soup.find("a", {"class": "internal"})["href"]
        if full_image_link.startswith("//"):
            full_image_link = "https:" + full_image_link

        image_response = requests.get(full_image_link)
        filename = name.replace(" ", "_").replace(",", "").replace("(", "").replace(")", "") + "." + full_image_link.split('.')[-1].split('?')[0]
        with open(filename, 'wb') as f:
            f.write(image_response.content)
        print(f"Downloaded: {filename}")
    except Exception as e:
        print(f"Failed to download for {name}: {e}")

for loc in locations:
    if loc["url"]:
        download_commons_image(loc["url"], loc["name"])
    else:
        print(f"No image URL available for: {loc['name']}")