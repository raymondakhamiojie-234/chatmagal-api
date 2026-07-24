import urllib.request

url = "https://convoy-ultimate-whatsapp-business-platform-741893254189.us-west1.run.app/assets/index-OW-9FIk3.js"
print("Extracting full privacy text...")

try:
    with urllib.request.urlopen(url) as response:
        js_content = response.read().decode('utf-8')
    
    # We know the content is roughly between position 1822000 and 1832000
    start_pos = 1822000
    end_pos = 1832000
    sub_content = js_content[start_pos:end_pos]
    
    with open("scratch/privacy_snippet.txt", "w", encoding="utf-8") as f:
        f.write(sub_content)
    
    print("Saved snippet to scratch/privacy_snippet.txt")

except Exception as e:
    print("Error:", e)
