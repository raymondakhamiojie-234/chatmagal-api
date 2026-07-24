import re

with open("scratch/terms_final_code.txt", "r", encoding="utf-8") as f:
    code = f.read()

# Let's search for the sections:
# We know from the second half that we have sections 5, 6, 7, 8.
# So sections 1, 2, 3, 4 must be in the first half!
# Let's find matches for h2 headings in the code:
headings = re.findall(r'children:\s*["\'`]([0-9]+\..*?)["\'`]', code)
print("All Headings in terms_final_code.txt:")
for h in headings:
    print("-", h)

# Let's print the text for sections 1, 2, 3, 4 specifically
# We will search for the heading names and print the text between them.
# The headings are:
# 1. ACCEPTANCE OF TERMS & SERVICE DESCRIPTION
# 2. ACCOUNT REGISTRATION & META VERIFICATION
# 3. ACCEPTABLE USE & MESSAGING COMPLIANCE
# 4. SUBSCRIPTION BILLING & META FEES
# 5. SERVICE AVAILABILITY & INFRASTRUCTURE DISCLAIMERS
# 6. SUSPENSION & TERMINATION OF SERVICE
# 7. LIMITATION OF LIABILITY & INDEMNIFICATION
# 8. GOVERNING LAW & DISPUTE RESOLUTION

section_names = [
    "1. ACCEPTANCE OF TERMS",
    "2. ACCOUNT REGISTRATION",
    "3. ACCEPTABLE USE",
    "4. SUBSCRIPTION BILLING"
]

for name in section_names:
    pos = code.find(name)
    if pos != -1:
        print(f"\n=== SECTION '{name}' ===")
        print(code[pos:pos+3000])
    else:
        print(f"Could not find section '{name}' in the code.")
