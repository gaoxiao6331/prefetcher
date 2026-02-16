# Read version number from package.json
VERSION=$(node -pe "require('./package.json').version")

# There is no ARM64 version for the official Puppeteer image, so pulling the AMD64 version and running it on Mac using Rosetta.
docker build --platform linux/amd64 -t prefetcher:$VERSION .
