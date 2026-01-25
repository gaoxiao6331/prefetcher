# Read version number from package.json
VERSION=$(node -pe "require('./package.json').version")

ARCH=$(uname -m)
case "$ARCH" in
	arm64|aarch64) DOCKER_PLATFORM=linux/arm64 ;;
	x86_64|amd64) DOCKER_PLATFORM=linux/amd64 ;;
	*) DOCKER_PLATFORM=linux/amd64 ;;
esac

docker build --platform "$DOCKER_PLATFORM" -t prefetcher:$VERSION .
