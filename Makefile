.PHONY: proto build-bridge test-go test-i18n tidy-go install-extension build-extension all

proto:
	buf generate

build-bridge:
	go build -C packages/bridge-go -o bridge ./cmd/bridge

test-go:
	go test -C packages/bridge-go ./...

test-i18n:
	node scripts/check-i18n.js

tidy-go:
	go -C packages/bridge-go mod tidy

install-extension:
	npm --prefix plugins/vscode-extension install

build-extension:
	npm --prefix plugins/vscode-extension run compile

all: proto build-bridge build-extension

