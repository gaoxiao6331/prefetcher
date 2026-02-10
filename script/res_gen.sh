TIMESTAMP=$(date +"%m%d-%H:%M")

curl -X POST http://localhost:3000/res_gen \
     -H "Content-Type: application/json" \
     -d "{
          \"targetUrl\": \"https://gaoxiao6331.github.io/prefetcher-examples/b/\",
          \"projectName\": \"examples\",
          \"targetFileName\": \"ex-res.js\",
          \"template\": \"window.prefetch_list= __content_placeholder__; // this is for /b $TIMESTAMP\"
         }"