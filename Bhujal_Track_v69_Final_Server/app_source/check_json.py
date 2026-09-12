import json

with open(r"c:\Users\dassa\OneDrive\Documents\gwapi\gw-mobile\src\data\wells.json", "r") as f:
    data = json.load(f)

has_bmp = sum(1 for w in data if w.get("dtgwl_bmp") is not None)
has_mbgl = sum(1 for w in data if w.get("dtgwl_mbgl") is not None)
total = len(data)

print(f"Total wells: {total}")
print(f"Wells with dtgwl_bmp: {has_bmp}")
print(f"Wells with dtgwl_mbgl: {has_mbgl}")
