.PHONY: proto build-bridge test-go tidy-go install-extension build-extension all

proto:
	buf generate

build-bridge:
	go build -C packages/bridge-go -o bridge ./cmd/bridge

test-go:
	go test -C packages/bridge-go ./...

tidy-go:
	go -C packages/bridge-go mod tidy

install-extension:
	npm --prefix plugins/vscode-extension install

build-extension:
	npm --prefix plugins/vscode-extension run compile

all: proto build-bridge build-extension

