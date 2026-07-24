import urllib.request

url = "https://convoy-ultimate-whatsapp-business-platform-741893254189.us-west1.run.app/assets/index-OW-9FIk3.js"
print("Extracting terms code from correct position...")

try:
    with urllib.request.urlopen(url) as response:
        js_content = response.read().decode('utf-8')
    
    # We know the index of children:"Terms of Service" is 382950
    # Let's extract from 380000 to 420000 to be safe and cover the entire component
    start_pos = 380000
    end_pos = 420000
    snippet = js_content[start_pos:end_pos]
    
    with open("scratch/terms_correct_snippet.txt", "w", encoding="utf-8") as f:
        f.write(snippet)
    
    print("Saved snippet to scratch/terms_correct_snippet.txt")

    # Let's find the exact component structure
    # Let's look for headings like "1. ACCEPTANCE", "2. DESCRIPTION", etc.
    # We will search in the snippet.
    terms_start = snippet.find('children:"Terms of Service"')
    print(f"Terms heading found at relative position: {terms_start}")

except Exception as e:
    print("Error:", e)
