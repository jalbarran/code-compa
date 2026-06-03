package main

import (
	"context"
	"encoding/json"
	"flag"
	"fmt"
	"log"
	"net"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	"connectrpc.com/connect"
	"github.com/google/uuid"
	"golang.org/x/net/http2"
	"golang.org/x/net/http2/h2c"

	"github.com/jalbarran/code-compa/packages/bridge-go/internal/discovery"
	"github.com/jalbarran/code-compa/packages/bridge-go/internal/lockfile"
	"github.com/jalbarran/code-compa/packages/bridge-go/internal/server"
	"github.com/jalbarran/code-compa/packages/bridge-go/pkg/api/v1/proto/codecompa/v1/apiv1connect"
)

type OutputConfig struct {
	Port   int    `json:"port"`
	Token  string `json:"token"`
	Status string `json:"status"`
}

func main() {
	workspacePath := flag.String("workspace-path", "", "Path to the active workspace")
	flag.Parse()

	if *workspacePath == "" {
		log.Fatal("Error: -workspace-path is required")
	}

	// 1. Generate token
	token := uuid.New().String()

	// 2. Scan ports starting from 8765
	var listener net.Listener
	var err error
	port := 8765
	for {
		addr := fmt.Sprintf(":%d", port)
		listener, err = net.Listen("tcp", addr)
		if err == nil {
			break
		}
		port++
		if port > 9000 {
			log.Fatalf("Error: could not find an available port to bind: %v", err)
		}
	}

	// 3. Acquire Lockfile
	acquiredPort, acquired, err := lockfile.CheckAndAcquire(*workspacePath, port)
	if err != nil {
		listener.Close()
		log.Fatalf("Error acquiring lockfile: %v", err)
	}

	if !acquired {
		// Another bridge is already running for this workspace.
		// Print its port and exit.
		listener.Close()
		config := OutputConfig{
			Port:   acquiredPort,
			Token:  "",
			Status: "ALREADY_RUNNING",
		}
		output, _ := json.Marshal(config)
		fmt.Println(string(output))
		os.Exit(0)
	}

	// Clean up lockfile on exit
	lockfilePath := lockfile.GetLockfilePath(*workspacePath)
	defer os.Remove(lockfilePath)

	// 4. Resolve Local LAN IP (Discovery)
	_, err = discovery.GetLocalIP()
	if err != nil {
		// We resolve it but don't strictly require it to start localhost server
	}

	// 5. Setup Connect Handler
	companionServer := server.NewCompanionServer(token)
	path, handler := apiv1connect.NewCompanionServiceHandler(
		companionServer,
		connect.WithInterceptors(server.NewAuthInterceptor(token)),
	)

	// Configure mux
	mux := http.NewServeMux()
	mux.Handle(path, handler)

	// Use h2c so we can support HTTP/2 without TLS
	srv := &http.Server{
		Addr:    listener.Addr().String(),
		Handler: h2c.NewHandler(mux, &http2.Server{}),
	}

	// 6. Trap SIGTERM and SIGINT
	sigChan := make(chan os.Signal, 1)
	signal.Notify(sigChan, syscall.SIGTERM, syscall.SIGINT)

	go func() {
		<-sigChan
		// Graceful shutdown
		ctx, cancel := context.WithTimeout(context.Background(), 3*time.Second)
		defer cancel()
		_ = srv.Shutdown(ctx)
		_ = os.Remove(lockfilePath)
		os.Exit(0)
	}()

	// 7. Output dynamic config to stdout
	config := OutputConfig{
		Port:   port,
		Token:  token,
		Status: "READY",
	}
	output, _ := json.Marshal(config)
	fmt.Println(string(output))

	// 8. Start HTTP Server
	if err := srv.Serve(listener); err != nil && err != http.ErrServerClosed {
		log.Fatalf("Server failed: %v", err)
	}
}
