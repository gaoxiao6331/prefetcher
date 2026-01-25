# Read version number from package.json
VERSION=$(node -pe "require('./package.json').version")

docker build -t prefetcher:$VERSION .
