import urllib.request
import re

url = "https://convoy-ultimate-whatsapp-business-platform-741893254189.us-west1.run.app/assets/index-OW-9FIk3.js"
print("Downloading JS to locate Terms of Service page component...")

try:
    with urllib.request.urlopen(url) as response:
        js_content = response.read().decode('utf-8')
    
    print(f"Downloaded {len(js_content)} bytes.")

    # We want to find a heading like "Terms of Service" but with "text-4xl" or "font-bold" in the same area.
    # Let's search for all occurrences of "Terms of Service" in the file
    matches = [m.start() for m in re.finditer("Terms of Service", js_content)]
    print(f"Found 'Terms of Service' {len(matches)} times:")
    for idx, pos in enumerate(matches):
        start = max(0, pos - 100)
        end = min(len(js_content), pos + 300)
        snippet = js_content[start:end]
        print(f"Match {idx+1} at position {pos}:\n{snippet}\n{'-'*50}")

    # Let's search for a string like "1. ACCEPTANCE" or "2. USE OF" or "3. BILLING" or "4. INTELLECTUAL" or similar typical terms headers
    # Let's search for "ACCEPTANCE OF TERMS"
    acceptance_matches = [m.start() for m in re.finditer("ACCEPTANCE OF TERMS", js_content, re.IGNORECASE)]
    print(f"Found 'ACCEPTANCE OF TERMS' {len(acceptance_matches)} times:")
    for idx, pos in enumerate(acceptance_matches):
        start = max(0, pos - 200)
        end = min(len(js_content), pos + 600)
        snippet = js_content[start:end]
        print(f"Acceptance Match {idx+1} at position {pos}:\n{snippet}\n{'-'*50}")

except Exception as e:
    print("Error:", e)
