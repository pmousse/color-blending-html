"""Screenshot capture: grid rendered with a given space (format 16:9, density 13).

Usage: python .t/shoot.py <space> <file.png>
"""
import re
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
CHROME = r"C:\Program Files\Google\Chrome\Application\chrome.exe"

space = sys.argv[1]
output = sys.argv[2]

html = (ROOT / "index.html").read_text(encoding="utf-8")
inject = """
  <script>
    const set = (id, value, type) => {
      const e = document.getElementById(id);
      e.value = value;
      e.dispatchEvent(new Event(type));
    };
    set("format", "16:9", "change");
    const d = document.getElementById("density");
    d.value = "13";
    d.dispatchEvent(new Event("input"));
    set("space", "%s", "change");
  </script>
</body>
</html>
""" % space
probe = re.sub(r"</body>\s*</html>\s*$", inject, html)
file = ROOT / "_probe.html"
file.write_text(probe, encoding="utf-8")

subprocess.run([
    CHROME, "--headless=new", "--disable-gpu", "--no-first-run", "--hide-scrollbars",
    "--window-size=1400,900",
    "--screenshot=D:\\blend_colors_html\\" + output,
    "--user-data-dir=C:\\Users\\lions\\AppData\\Local\\Temp\\cgshoot",
    "--virtual-time-budget=4000",
    "file:///" + str(file).replace("\\", "/"),
], capture_output=True)
print("capture:", output)
