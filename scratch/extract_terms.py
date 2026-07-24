import urllib.request
import re

url = "https://convoy-ultimate-whatsapp-business-platform-741893254189.us-west1.run.app/assets/index-OW-9FIk3.js"
print("Downloading JS to extract Terms of Service...")

try:
    # We can read the local cache if we want, but downloading is fast
    with urllib.request.urlopen(url) as response:
        js_content = response.read().decode('utf-8')
    
    print(f"Downloaded {len(js_content)} bytes.")

    # Search for Terms of Service text in the JS content
    # The terms page usually has sections like "Terms of Service", "ACCEPTANCE OF TERMS", "LIMITATION OF LIABILITY"
    start_idx = js_content.find('children:"Terms of Service"')
    print(f"Index of 'children:\"Terms of Service\"': {start_idx}")

    # Let's find matches for Terms of Service headers or content
    # We know the privacy policy was at pos 1823654
    # The terms of service page is likely immediately following or preceding it in the bundle!
    # Let's search around that position (1830000 to 1845000)
    start_pos = 1830000
    end_pos = 1848000
    snippet = js_content[start_pos:end_pos]
    
    with open("scratch/terms_snippet.txt", "w", encoding="utf-8") as f:
        f.write(snippet)
    print("Saved terms snippet to scratch/terms_snippet.txt")

    # Let's print out the exact component boundaries if we can find them
    # It likely starts around `children:"Terms of Service"` and ends before the end of the file or next component.
    start = js_content.find('w-none",children:[l.jsx("h1",{className:"text-4xl font-bold text-white mb-2 font-display",children:"Terms of Service"})')
    end = js_content.find('not-allowed",children:"I Accept and Agree to the Terms of Service"')
    if start != -1:
        print(f"Found Terms start at {start}")
        # Let's find where the terms end (usually has a list of sections or contact info)
        # Let's extract 15000 characters from start
        terms_code = js_content[start:start+18000]
        with open("scratch/terms_code.txt", "w", encoding="utf-8") as f:
            f.write(terms_code)
        print("Saved terms component code to scratch/terms_code.txt")
    else:
        print("Could not find Terms component start index automatically.")

except Exception as e:
    print("Error:", e)
