import re

with open("scratch/terms_full_snippet.txt", "r", encoding="utf-8") as f:
    text = f.read()

# Let's search for "1. ACCEPTANCE" or similar to find the start position in this snippet
start_pos = text.find("ACCEPTANCE OF TERMS")
print(f"ACCEPTANCE OF TERMS found at relative position: {start_pos}")

# Let's extract and print the text around it (e.g., 10000 characters)
# We can clean up the JSX and format it as Markdown.
# Let's print out the raw code so we can see it clearly!
print("\n--- RAW JSX TERMS CODE ---")
if start_pos != -1:
    terms_code = text[start_pos - 300 : start_pos + 11000]
    print(terms_code)
    with open("scratch/terms_final_code.txt", "w", encoding="utf-8") as f:
        f.write(terms_code)
else:
    print("Could not find start position in snippet.")
