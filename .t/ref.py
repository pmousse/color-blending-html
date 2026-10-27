"""Python reference for the bilinear pass.

Run from the project root, after .t/ui.mjs has written .t/matrix.json:
    python .t/ref.py
The reference grid uses the default corners red / green / blue / yellow and the
sRGB space, so it must match what the page produced at density 5, format 1:1.
"""
import json, sys
TL=(255,0,0); TR=(0,255,0); BL=(0,0,255); BR=(255,255,0)
def mix(a,b,t): return tuple(round(a[i]+(b[i]-a[i])*t) for i in range(3))
def grid(cols,rows):
    out=[]
    for row in range(rows):
        line=[]
        for col in range(cols):
            x = col/(cols-1) if cols>1 else 0.0
            y = 1-row/(rows-1) if rows>1 else 0.0
            left = mix(BL,TL,y); right = mix(BR,TR,y)
            line.append("#%02x%02x%02x" % mix(left,right,x))
        out.append(line)
    return out
mine=json.load(open(".t/matrix.json", encoding="utf-8"))
ref=grid(5,5)
print("identical" if mine==ref else "DIFFERENT")
if mine!=ref:
    for a,b in zip(mine,ref):
        if a!=b: print(a,b)
    sys.exit(1)
