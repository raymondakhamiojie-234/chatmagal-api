import urllib.request
import re

url = "https://convoy-ultimate-whatsapp-business-platform-741893254189.us-west1.run.app/assets/index-OW-9FIk3.js"
print(f"Downloading {url}...")

try:
    with urllib.request.urlopen(url) as response:
        js_content = response.read().decode('utf-8')
    
    print(f"Downloaded {len(js_content)} bytes of JavaScript.")

    # Let's search for some typical privacy policy sections or strings in the JS content
    # Look for long string literals, or specific headings
    keywords = ["Privacy Policy", "Information We Collect", "How We Use", "Data Retention", "Cookies", "Meta API", "Facebook Login"]
    
    # Let's find matches and print surrounding context (e.g. 500 characters around)
    for kw in keywords:
        matches = [m.start() for m in re.finditer(kw, js_content, re.IGNORECASE)]
        print(f"\nKeyword '{kw}' found {len(matches)} times:")
        for idx, start_pos in enumerate(matches[:5]):
            start = max(0, start_pos - 100)
            end = min(len(js_content), start_pos + 800)
            snippet = js_content[start:end]
            print(f"Match {idx+1} (pos {start_pos}):\n{snippet}\n{'-'*50}")

except Exception as e:
    print("Error:", e)
