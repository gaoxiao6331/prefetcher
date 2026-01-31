curl -X POST http://localhost:3000/res_gen \
     -H "Content-Type: application/json" \
     -d '{
          "targetUrl": "http://localhost:3001/b",
          "projectName": "examples",
          "targetFileName": "ex-res.js",
          "template": "window.prefetch_list= __content_placeholder__; // this is for 3001/b 0201-00:02"
         }'