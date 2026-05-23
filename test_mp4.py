import subprocess
import json
import os

mkvmerge_path = r"C:\Program Files\MKVToolNix\mkvmerge.exe"
mkvpropedit_path = r"C:\Program Files\MKVToolNix\mkvpropedit.exe"
dummy_mp4 = "dummy.mp4"
dummy_mkv = "dummy.mkv"

# Create a dummy MP4 file using ffmpeg
subprocess.run([
    "ffmpeg", "-y", "-f", "lavfi", "-i", "color=c=black:s=640x480:d=1",
    "-f", "lavfi", "-i", "anullsrc=r=44100:cl=stereo:d=1",
    "-c:v", "libx264", "-c:a", "aac", dummy_mp4
], capture_output=True)

# Remux to MKV and set title and track names
# For dummy.mp4, video track ID is 0, audio track ID is 1.
# Options:
# --title "[Dwarf] dummy"
# --track-name 0:"[Dwarf] Video" --track-name 1:"[Dwarf] Inglés"
cmd = [
    mkvmerge_path,
    "-o", dummy_mkv,
    "--title", "[Dwarf] dummy",
    "--track-name", "0:[Dwarf] Video",
    "--track-name", "1:[Dwarf] Inglés",
    dummy_mp4
]

res = subprocess.run(cmd, capture_output=True, text=True, encoding="utf-8")
print("mkvmerge stdout:")
print(res.stdout)
print("mkvmerge stderr:")
print(res.stderr)

# Now check the generated MKV file info using mkvmerge -J
res_info = subprocess.run([mkvmerge_path, "-J", dummy_mkv], capture_output=True, text=True, encoding="utf-8")
info = json.loads(res_info.stdout)
print("\nGenerated MKV info:")
print(json.dumps(info, indent=2))

# Cleanup
for f in [dummy_mp4, dummy_mkv]:
    if os.path.exists(f):
        os.remove(f)
