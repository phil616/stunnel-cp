.PHONY: build web test run release clean
VERSION ?= dev
RELEASE_GOOS ?= $(shell go env GOOS)
RELEASE_GOARCH ?= $(shell go env GOARCH)
web:
	npm ci --prefix web
	npm run build --prefix web
build: web
	CGO_ENABLED=0 go build -trimpath -ldflags='-s -w' -o bin/stunnel-cp ./cmd/stunnel-cp
test:
	go test -race ./...
release: web
	bash scripts/build-release.sh "$(VERSION)" "$(RELEASE_GOOS)" "$(RELEASE_GOARCH)"
run:
	go run ./cmd/stunnel-cp serve
clean:
	rm -rf bin
