package main

import (
	"context"
	"encoding/json"
	"fmt"
	"log"
	"net"
	"net/http"
	"time"

	"connectrpc.com/connect"
	"github.com/google/uuid"
	"golang.org/x/net/http2"
	"golang.org/x/net/http2/h2c"

	"github.com/jalbarran/code-compa/packages/bridge-go/internal/discovery"
	"github.com/jalbarran/code-compa/packages/bridge-go/internal/server"
	v1 "github.com/jalbarran/code-compa/packages/bridge-go/pkg/api/v1/proto/codecompa/v1"
	"github.com/jalbarran/code-compa/packages/bridge-go/pkg/api/v1/proto/codecompa/v1/apiv1connect"
)

type OutputConfig struct {
	IP     string `json:"ip"`
	Port   int    `json:"port"`
	Token  string `json:"token"`
	Status string `json:"status"`
}

func main() {
	token := "XXX" // Static token for easy development testing
	port := 8765

	addr := fmt.Sprintf(":%d", port)
	listener, err := net.Listen("tcp", addr)
	if err != nil {
		log.Fatalf("Error binding listener: %v", err)
	}

	ip, err := discovery.GetLocalIP()
	if err != nil {
		ip = "127.0.0.1"
	}

	companionServer := server.NewCompanionServer(token)
	path, handler := apiv1connect.NewCompanionServiceHandler(
		companionServer,
		connect.WithInterceptors(server.NewAuthInterceptor(token)),
	)

	mux := http.NewServeMux()
	mux.Handle(path, handler)

	srv := &http.Server{
		Addr:    listener.Addr().String(),
		Handler: h2c.NewHandler(mux, &http2.Server{}),
	}

	config := OutputConfig{
		IP:     ip,
		Port:   port,
		Token:  token,
		Status: "READY",
	}

	configJSON, _ := json.MarshalIndent(config, "", "  ")
	fmt.Println("=== MOCK BRIDGE RUNNING ===")
	fmt.Println(string(configJSON))
	fmt.Println("==========================")

	go func() {
		time.Sleep(5 * time.Second)
		eventID := "evt-" + uuid.New().String()[:8]
		fmt.Printf("\n[Mock Agent] Queuing new human-in-the-loop intervention event: %s...\n", eventID)

		event := &v1.AgentEvent{
			EventId: eventID,
			Type:    "COMMAND_EXECUTION_REQUEST",
			Metadata: &v1.AgentMetadata{
				Ide:       "VS Code - Antigravity Mock",
				AgentName: "Super-Code-Agent-9000",
				Timestamp: time.Now().Unix(),
			},
			Payload: &v1.AgentPayload{
				Title:           "Database Schema Migration",
				Description:     "The agent requested permission to run database schema migrations against the local development environment.",
				Command:         "go run cmd/migrate/main.go --env development --force",
				Directory:       "/home/user/projects/code-compa",
				RiskLevel:       "HIGH",
				AllowsTextInput: true,
				Diff:            "diff --git a/schema.sql b/schema.sql\n--- a/schema.sql\n+++ b/schema.sql\n@@ -1,4 +1,5 @@\n CREATE TABLE users (\n   id INT PRIMARY KEY,\n-  name VARCHAR(50)\n+  name VARCHAR(100),\n+  email VARCHAR(255) UNIQUE NOT NULL\n );",
				Prompt:          "Run migrations to alter users table. Add email field and update username size restriction.",
				Options: []*v1.DecisionOption{
					{Id: "REJECT", Label: "Reject & Stop"},
					{Id: "APPROVE", Label: "Run Migration"},
				},
			},
		}

		ctx, cancel := context.WithTimeout(context.Background(), 2*time.Minute)
		defer cancel()

		resp, err := companionServer.QueueEvent(ctx, event)
		if err != nil {
			fmt.Printf("[Mock Agent] Event %s failed or timed out: %v\n", eventID, err)
			return
		}

		fmt.Printf("\n[Mock Agent] Received human response for event %s:\n", eventID)
		fmt.Printf("  Selected Option: %s\n", resp.SelectedOptionId)
		fmt.Printf("  Feedback text:   %s\n", resp.FeedbackText)
	}()

	if err := srv.Serve(listener); err != nil && err != http.ErrServerClosed {
		log.Fatalf("Server failed: %v", err)
	}
}
