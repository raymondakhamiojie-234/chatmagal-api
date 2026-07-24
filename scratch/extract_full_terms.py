import urllib.request

url = "https://convoy-ultimate-whatsapp-business-platform-741893254189.us-west1.run.app/assets/index-OW-9FIk3.js"
print("Extracting full terms of service text...")

try:
    with urllib.request.urlopen(url) as response:
        js_content = response.read().decode('utf-8')
    
    # We know the Terms of Service starts around 1832000
    # Let's extract from 1831000 to 1845000
    start_pos = 1831000
    end_pos = 1845000
    snippet = js_content[start_pos:end_pos]
    
    with open("scratch/terms_full_snippet.txt", "w", encoding="utf-8") as f:
        f.write(snippet)
    
    print("Saved snippet to scratch/terms_full_snippet.txt")

    # Let's find the exact component structure and print it out!
    start = snippet.find('w-none",children:[l.jsx("h1"')
    end = snippet.find('Address:"})," 2 Ekezue Street, off Eziokpor Road, Obiaruku, Ukwuani, Delta State, Nigeria."')
    
    # Actually, let's print from where the h1 of Terms of Service is:
    terms_start = snippet.find('children:"Terms of Service"')
    print(f"Terms start found at relative position: {terms_start}")
    
    # Let's print the next 10000 characters from the Terms heading to read it
    with open("scratch/terms_clean_code.txt", "w", encoding="utf-8") as f:
        f.write(snippet[terms_start-500:terms_start+12000])
    print("Saved clean code to scratch/terms_clean_code.txt")

except Exception as e:
    print("Error:", e)
