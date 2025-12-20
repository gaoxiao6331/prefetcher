# 从package.json中读取版本号
VERSION=$(node -pe "require('./package.json').version")

docker build -t prefechter:$VERSION .
