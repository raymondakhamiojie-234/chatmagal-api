with open("scratch/terms_correct_snippet.txt", "r", encoding="utf-8") as f:
    text = f.read()

# The relative position in the snippet is 2950 (which corresponds to index 382950 in the JS file)
start = 2950
print("--- PRINTING AROUND THE TERMS OF SERVICE HEADING ---")
print(text[start - 500 : start + 3000])
