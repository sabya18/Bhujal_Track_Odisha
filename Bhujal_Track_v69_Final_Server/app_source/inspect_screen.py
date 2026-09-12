from PIL import Image

img_path = r"C:\Users\dassa\.gemini\antigravity\brain\8e86f0bc-f3d3-4007-9489-10a19e6cea11\bhujal_v6_map.png"
img = Image.open(img_path)
width, height = img.size

# Let's inspect colors along y=168, 170, 180, 200, 220, 240, 260
for y in [150, 170, 190, 210, 230, 250, 270]:
    # Print color of pixels every 20 pixels from 700 to 1050
    colors = []
    for x in range(700, 1080, 40):
        r, g, b, *a = img.getpixel((x, y))
        colors.append((x, (r, g, b)))
    print(f"Y={y} slice colors:")
    print(colors)
