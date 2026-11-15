"""Extract named members from a remote zip using HTTP range requests.
usage: remote_zip_extract.py URL OUTDIR member [member ...]"""
import io, os, sys, zipfile, urllib.request, shutil
class HTTPFile(io.RawIOBase):
    def __init__(s,url):
        s.url=url; s.pos=0
        r=urllib.request.urlopen(urllib.request.Request(url,headers={'Range':'bytes=0-0'})); s.size=int(r.headers['Content-Range'].split('/')[1])
    def seekable(s): return True
    def readable(s): return True
    def tell(s): return s.pos
    def seek(s,o,w=0): s.pos = o if w==0 else s.pos+o if w==1 else s.size+o; return s.pos
    def readinto(s,b):
        n=len(b)
        if n==0 or s.pos>=s.size: return 0
        end=min(s.pos+n,s.size)-1
        d=urllib.request.urlopen(urllib.request.Request(s.url,headers={'Range':f'bytes={s.pos}-{end}'})).read()
        b[:len(d)]=d; s.pos+=len(d); return len(d)
url,out,members=sys.argv[1],sys.argv[2],sys.argv[3:]
z=zipfile.ZipFile(io.BufferedReader(HTTPFile(url),buffer_size=8<<20))
os.makedirs(out,exist_ok=True)
for m in members:
    dst=os.path.join(out,os.path.basename(m))
    with z.open(m) as src, open(dst,'wb') as f: shutil.copyfileobj(src,f,8<<20)
    print('saved',os.path.basename(m),os.path.getsize(dst))
