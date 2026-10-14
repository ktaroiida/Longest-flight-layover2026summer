"""After npm run build, embed the compiled assets in one reviewable HTML file."""
from pathlib import Path
import re
root=Path(__file__).resolve().parents[1]
html=(root/'dist/index.html').read_text()
# The development entry's file guide is not part of the self-contained app.
html=re.sub(r'<script id="source-file-guide">.*?</script>', '', html, flags=re.S)
html=re.sub(r'<div id="root">.*?</div></div>', '<div id="root"></div>', html, flags=re.S)
for pattern,tag in [(r'<script[^>]+src="([^"]+)"[^>]*></script>','script'),(r'<link[^>]+href="([^"]+\.css)"[^>]*>','style')]:
 def inline(match):
  text=(root/'dist'/match[1].removeprefix('./')).read_text()
  if tag=='script':
   text=re.sub(r'</script',r'<\\/script',text,flags=re.I)
   return '<script type="module">'+text+'</script>'
  return '<style>'+text+'</style>'
 html=re.sub(pattern,inline,html)
notices=(root/'THIRD_PARTY_LICENSES.txt').read_text().replace('</script','<\\/script')
html=html.replace('</head>','<script type="text/plain" id="third-party-licenses">'+notices+'</script></head>')
(root.parent/'航空路線ビジュアライザー_Phase1.html').write_text(html)
print('Standalone HTML:',len(html.encode()),'bytes')
