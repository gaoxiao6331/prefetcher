# Read version number from package.json
VERSION=$(node -pe "require('../package.json').version")

docker run -it \
    -e NODE_ENV=dev \
    -v ~/.ssh/test/id_rsa:/home/pptruser/.ssh/id_rsa:ro \
    -p 3000:3000 \
    --name prefetcher-test \
    --log-driver json-file \
    --log-opt max-size=10m \
    --log-opt max-file=3 \
    prefetcher:$VERSION
