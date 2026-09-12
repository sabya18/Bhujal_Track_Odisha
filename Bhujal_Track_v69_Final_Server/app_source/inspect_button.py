from PIL import Image

img_path = r"C:\Users\dassa\.gemini\antigravity\brain\8e86f0bc-f3d3-4007-9489-10a19e6cea11\bhujal_v6_map_gis.png"
img = Image.open(img_path)

# Let's inspect colors of background pixels inside the button at X=800, Y=170, 190, 210
# (avoiding the emoji which is in the center X=820)
for y in [170, 190, 210]:
    for x in [800, 840]:
        r, g, b, *a = img.getpixel((x, y))
        print(f"Pixel at ({x}, {y}): RGB({r}, {g}, {b})")
