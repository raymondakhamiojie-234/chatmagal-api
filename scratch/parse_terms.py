import re

with open("scratch/terms_correct_snippet.txt", "r", encoding="utf-8") as f:
    text = f.read()

# The terms heading is at relative position 2950
# Let's extract from pos 2000 to pos 25000 of the snippet to cover the terms page component
terms_js = text[2000:30000]

print("--- SEARCHING FOR TERMS OF SERVICE TEXT ---")

# Let's find the exact boundaries of the Terms of Service component
# It likely starts with a h1 with children "Terms of Service"
# and ends with some button or footer or contact details.
# Let's find the text of the headings and paragraphs.
# We can use regex to find all jsx calls with headings or text.

# Let's print out text that matches headings: e.g. "1. ", "2. ", "3. "
headings = re.findall(r'children:\s*["\'`]([0-9]+\..*?)["\'`]', terms_js)
print("Headings found:")
for h in headings:
    print("-", h)

# Let's print out the first 3000 characters of terms_js to inspect the text directly
print("\n--- FIRST 4000 CHARS OF TERMS JS ---")
print(terms_js[:4000])

# Let's print out the next 4000 characters to inspect further
print("\n--- NEXT 4000 CHARS OF TERMS JS ---")
print(terms_js[4000:8000])

# Let's search for contact info or address in terms_js
print("\n--- CONTACT INFO SEARCH ---")
contact_pos = terms_js.find("privacy@chatmagal.com")
if contact_pos != -1:
    print(terms_js[contact_pos-500:contact_pos+500])
else:
    print("No direct email match, searching for contact or address...")
    # let's look for "address" or "Delta State"
    delta_pos = terms_js.find("Delta State")
    if delta_pos != -1:
        print(terms_js[delta_pos-500:delta_pos+500])
    else:
        print("Delta State not found.")
