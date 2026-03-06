import os
import glob

REPLACEMENTS = [
    ("\U0001f9fb", ""),   # xray/stethoscope
    ("\u2705", ""),       # checkmark box
    ("\u274c", ""),       # cross mark
    ("\u26a0\ufe0f", ""), # warning
    ("\u26a0", ""),       # warning
    ("\u2139\ufe0f", ""), # info
    ("\U0001f511", ""),   # key
    ("\u26a1", ""),       # lightning
    ("\U0001f4c1", ""),   # folder
    ("\u2726", ""),       # star
    ("\u25c8", ""),       # diamond
    ("\u25c9", ""),       # fisheye
    ("\u25ce", ""),       # bullseye
    ("\u25c6", ""),       # black diamond
    ("\u25c7", ""),       # white diamond
    ("\u2b21", ""),       # hexagon
    ("\u27f3", ""),       # clockwise arrow
    ("\u270e", ""),       # pencil
    ("\u2713", ""),       # checkmark
    ("\u21ba", ""),       # anticlockwise arrow
    ("\u2600", ""),       # sun
    ("\u263e", ""),       # crescent moon
    ("\u25b8", ""),       # right triangle
    ("\u25be", ""),       # down triangle
    ("\U0001fa7a", ""),   # stethoscope
    ("\U0001f9ec", ""),   # dna
    ("\U0001f4ca", ""),   # bar chart
    ("\U0001f4cb", ""),   # clipboard
    ("\U0001f4dd", ""),   # memo
    ("\u2764", ""),       # heart
    ("\u2665", ""),       # heart suit
    ("\U0001f5a5", ""),   # computer
    ("\U0001f4f1", ""),   # phone
]

# Adjust these paths to match your project
SEARCH_PATHS = [
    os.path.expanduser("~/Downloads/ubuzima-connect/src"),
    os.path.expanduser("~/Downloads/ubuzima-backend"),
]

EXTENSIONS = (".tsx", ".ts", ".jsx", ".js", ".py")

files_changed = 0
for base_path in SEARCH_PATHS:
    if not os.path.exists(base_path):
        print(f"Skipping (not found): {base_path}")
        continue
    for root, dirs, files in os.walk(base_path):
        # Skip node_modules and venv
        dirs[:] = [d for d in dirs if d not in ("node_modules", "venv", ".git", "__pycache__", "dist", "build")]
        for fname in files:
            if not fname.endswith(EXTENSIONS):
                continue
            fpath = os.path.join(root, fname)
            try:
                with open(fpath, "r", encoding="utf-8", errors="ignore") as f:
                    original = f.read()
                modified = original
                for emoji, replacement in REPLACEMENTS:
                    modified = modified.replace(emoji, replacement)
                if modified != original:
                    with open(fpath, "w", encoding="utf-8") as f:
                        f.write(modified)
                    print(f"Cleaned: {fpath}")
                    files_changed += 1
            except Exception as e:
                print(f"Skipped {fpath}: {e}")

print(f"\nDone — {files_changed} files cleaned")