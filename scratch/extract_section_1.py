with open("scratch/terms_final_code.txt", "r", encoding="utf-8") as f:
    code = f.read()

# Let's print the first 2800 characters of the code, which will contain the Acceptance of Terms and Section 1
print("=== SECTION 1 AND HEADINGS ===")
print(code[:2800])
