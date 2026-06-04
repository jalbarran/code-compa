package mcp

import (
	"bufio"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"os"
	"strings"

	"connectrpc.com/connect"
	"github.com/jalbarran/code-compa/packages/bridge-go/internal/lockfile"
	apiv1 "github.com/jalbarran/code-compa/packages/bridge-go/pkg/api/v1/proto/codecompa/v1"
	"github.com/jalbarran/code-compa/packages/bridge-go/pkg/api/v1/proto/codecompa/v1/apiv1connect"
)

// MCP JSON-RPC messages schema structures
type JsonRpcRequest struct {
	JsonRpc string          `json:"jsonrpc"`
	Method  string          `json:"method"`
	Params  json.RawMessage `json:"params,omitempty"`
	Id      interface{}     `json:"id,omitempty"`
}

type JsonRpcResponse struct {
	JsonRpc string      `json:"jsonrpc"`
	Result  interface{} `json:"result,omitempty"`
	Error   *McpError   `json:"error,omitempty"`
	Id      interface{} `json:"id"`
}

type McpError struct {
	Code    int         `json:"code"`
	Message string      `json:"message"`
	Data    interface{} `json:"data,omitempty"`
}

type Tool struct {
	Name        string      `json:"name"`
	Description string      `json:"description"`
	InputSchema InputSchema `json:"inputSchema"`
}

type InputSchema struct {
	Type       string                `json:"type"`
	Properties map[string]interface{} `json:"properties"`
	Required   []string              `json:"required,omitempty"`
}

type ListToolsResult struct {
	Tools []Tool `json:"tools"`
}

type CallToolParams struct {
	Name      string          `json:"name"`
	Arguments json.RawMessage `json:"arguments"`
}

type CallToolResult struct {
	Content []ContentBlock `json:"content"`
	IsError bool           `json:"isError,omitempty"`
}

type ContentBlock struct {
	Type string `json:"type"`
	Text string `json:"text"`
}

// Structs for arguments mapping
type ConfirmationArgs struct {
	Prompt      string `json:"prompt"`
	Criticality string `json:"criticality,omitempty"`
}

type ChoiceArgs struct {
	Question string   `json:"question"`
	Options  []string `json:"options"`
}

type InputArgs struct {
	Prompt      string `json:"prompt"`
	Placeholder string `json:"placeholder,omitempty"`
}

// Confirmation Tool Response payload
type ConfirmationResponse struct {
	Confirmed bool   `json:"confirmed"`
	Reason    string `json:"reason,omitempty"`
}

type ChoiceResponse struct {
	SelectedOption string `json:"selectedOption"`
}

type InputResponse struct {
	Input string `json:"input"`
}

// StartMcpServer starts the stdio loop for Model Context Protocol
func StartMcpServer(workspacePath string) {
	// 1. Read lockfile to establish client connection
	lockfilePath := lockfile.GetLockfilePath(workspacePath)
	lockData, err := lockfile.ReadLockfile(lockfilePath)
	if err != nil {
		sendInitError(fmt.Sprintf("Failed to read lockfile at %s: %v", lockfilePath, err))
		return
	}

	// 2. Initialize Connect-RPC client to bridge-go
	client := apiv1connect.NewCompanionServiceClient(
		http.DefaultClient,
		fmt.Sprintf("http://localhost:%d", lockData.Port),
		connect.WithInterceptors(connect.UnaryInterceptorFunc(func(next connect.UnaryFunc) connect.UnaryFunc {
			return func(ctx context.Context, req connect.AnyRequest) (connect.AnyResponse, error) {
				req.Header().Set("Authorization", "Bearer "+lockData.Token)
				return next(ctx, req)
			}
		})),
	)

	// 3. Stdio read loop
	reader := bufio.NewReader(os.Stdin)
	for {
		line, err := reader.ReadString('\n')
		if err != nil {
			if err == io.EOF {
				break
			}
			continue
		}

		line = strings.TrimSpace(line)
		if line == "" {
			continue
		}

		var req JsonRpcRequest
		if err := json.Unmarshal([]byte(line), &req); err != nil {
			sendError(nil, -32700, "Parse error: "+err.Error())
			continue
		}

		handleRequest(client, &req)
	}
}

func handleRequest(client apiv1connect.CompanionServiceClient, req *JsonRpcRequest) {
	switch req.Method {
	case "initialize":
		sendResponse(req.Id, map[string]interface{}{
			"protocolVersion": "2024-11-05",
			"capabilities": map[string]interface{}{
				"tools": map[string]interface{}{},
			},
			"serverInfo": map[string]string{
				"name":    "code-compa-mcp-go",
				"version": "1.0.0",
			},
		})

	case "tools/list":
		tools := []Tool{
			{
				Name:        "ask_human_confirmation",
				Description: "Request a binary (Approve/Reject) confirmation from the human developer via their mobile companion app. Use for terminal command execution approvals or file edits.",
				InputSchema: InputSchema{
					Type: "object",
					Properties: map[string]interface{}{
						"prompt": map[string]string{
							"type":        "string",
							"description": "The description of the action requiring approval (e.g. 'Execute git push origin main?').",
						},
						"criticality": map[string]interface{}{
							"type": "string",
							"enum": []string{"low", "medium", "high"},
							"description": "How risky/critical the action is.",
						},
					},
					Required: []string{"prompt"},
				},
			},
			{
				Name:        "ask_human_choice",
				Description: "Present a multiple-choice selection to the developer on their mobile companion app and wait for their choice.",
				InputSchema: InputSchema{
					Type: "object",
					Properties: map[string]interface{}{
						"question": map[string]string{
							"type":        "string",
							"description": "The question or instruction to display.",
						},
						"options": map[string]interface{}{
							"type": "array",
							"items": map[string]string{
								"type": "string",
							},
							"description": "List of string choices for the developer.",
						},
					},
					Required: []string{"question", "options"},
				},
			},
			{
				Name:        "ask_human_input",
				Description: "Request free-form text input from the developer via their mobile companion app.",
				InputSchema: InputSchema{
					Type: "object",
					Properties: map[string]interface{}{
						"prompt": map[string]string{
							"type":        "string",
							"description": "Instruction or query requiring textual feedback (e.g., 'Enter API Key').",
						},
						"placeholder": map[string]string{
							"type":        "string",
							"description": "Placeholder text for the text input field.",
						},
					},
					Required: []string{"prompt"},
				},
			},
		}
		sendResponse(req.Id, ListToolsResult{Tools: tools})

	case "tools/call":
		var params CallToolParams
		if err := json.Unmarshal(req.Params, &params); err != nil {
			sendError(req.Id, -32602, "Invalid params: "+err.Error())
			return
		}
		handleToolCall(client, req.Id, params)

	default:
		// Silently ignore or return not implemented for optional hooks/notifications
		if req.Id != nil {
			sendError(req.Id, -32601, "Method not found: "+req.Method)
		}
	}
}

func handleToolCall(client apiv1connect.CompanionServiceClient, id interface{}, params CallToolParams) {
	ctx := context.Background()

	switch params.Name {
	case "ask_human_confirmation":
		var args ConfirmationArgs
		if err := json.Unmarshal(params.Arguments, &args); err != nil {
			sendError(id, -32602, "Invalid arguments: "+err.Error())
			return
		}

		opts := []*apiv1.DecisionOption{
			{Id: "APPROVE", Label: "Approve"},
			{Id: "REJECT", Label: "Reject"},
		}

		res, err := client.RequestIntervention(ctx, connect.NewRequest(&apiv1.RequestInterventionRequest{
			Type: "CONFIRMATION",
			Metadata: &apiv1.AgentMetadata{
				Ide:       "VS Code",
				AgentName: "MCP-Server-Go",
			},
			Payload: &apiv1.AgentPayload{
				Title:           "Approval Request",
				Description:     args.Prompt,
				RiskLevel:       args.Criticality,
				Options:         opts,
				AllowsTextInput: false,
			},
		}))

		if err != nil {
			sendToolError(id, fmt.Sprintf("Failed to request intervention: %v", err))
			return
		}

		confirmed := res.Msg.SelectedOptionId == "APPROVE"
		feedback := res.Msg.FeedbackText

		payload, _ := json.Marshal(ConfirmationResponse{
			Confirmed: confirmed,
			Reason:    feedback,
		})

		sendResponse(id, CallToolResult{
			Content: []ContentBlock{
				{Type: "text", Text: string(payload)},
			},
		})

	case "ask_human_choice":
		var args ChoiceArgs
		if err := json.Unmarshal(params.Arguments, &args); err != nil {
			sendError(id, -32602, "Invalid arguments: "+err.Error())
			return
		}

		var opts []*apiv1.DecisionOption
		for _, opt := range args.Options {
			opts = append(opts, &apiv1.DecisionOption{Id: opt, Label: opt})
		}

		res, err := client.RequestIntervention(ctx, connect.NewRequest(&apiv1.RequestInterventionRequest{
			Type: "CHOICE_SELECTION",
			Metadata: &apiv1.AgentMetadata{
				Ide:       "VS Code",
				AgentName: "MCP-Server-Go",
			},
			Payload: &apiv1.AgentPayload{
				Title:           "Choice Selection",
				Description:     args.Question,
				Options:         opts,
				AllowsTextInput: false,
			},
		}))

		if err != nil {
			sendToolError(id, fmt.Sprintf("Failed to request choice: %v", err))
			return
		}

		payload, _ := json.Marshal(ChoiceResponse{
			SelectedOption: res.Msg.SelectedOptionId,
		})

		sendResponse(id, CallToolResult{
			Content: []ContentBlock{
				{Type: "text", Text: string(payload)},
			},
		})

	case "ask_human_input":
		var args InputArgs
		if err := json.Unmarshal(params.Arguments, &args); err != nil {
			sendError(id, -32602, "Invalid arguments: "+err.Error())
			return
		}

		res, err := client.RequestIntervention(ctx, connect.NewRequest(&apiv1.RequestInterventionRequest{
			Type: "TEXT_INPUT_REQUEST",
			Metadata: &apiv1.AgentMetadata{
				Ide:       "VS Code",
				AgentName: "MCP-Server-Go",
			},
			Payload: &apiv1.AgentPayload{
				Title:           "Input Request",
				Description:     args.Prompt,
				AllowsTextInput: true,
			},
		}))

		if err != nil {
			sendToolError(id, fmt.Sprintf("Failed to request text input: %v", err))
			return
		}

		payload, _ := json.Marshal(InputResponse{
			Input: res.Msg.FeedbackText,
		})

		sendResponse(id, CallToolResult{
			Content: []ContentBlock{
				{Type: "text", Text: string(payload)},
			},
		})

	default:
		sendError(id, -32601, "Tool not found: "+params.Name)
	}
}

func sendResponse(id interface{}, result interface{}) {
	res := JsonRpcResponse{
		JsonRpc: "2.0",
		Result:  result,
		Id:      id,
	}
	bytes, _ := json.Marshal(res)
	fmt.Println(string(bytes))
}

func sendError(id interface{}, code int, message string) {
	res := JsonRpcResponse{
		JsonRpc: "2.0",
		Error: &McpError{
			Code:    code,
			Message: message,
		},
		Id: id,
	}
	bytes, _ := json.Marshal(res)
	fmt.Println(string(bytes))
}

func sendToolError(id interface{}, msg string) {
	res := JsonRpcResponse{
		JsonRpc: "2.0",
		Result: CallToolResult{
			Content: []ContentBlock{
				{Type: "text", Text: "Error: " + msg},
			},
			IsError: true,
		},
		Id: id,
	}
	bytes, _ := json.Marshal(res)
	fmt.Println(string(bytes))
}

func sendInitError(msg string) {
	// Return a standard MCP connection failure or write structured log (never raw prints to preserve stdio channel)
	sendError(nil, -32000, msg)
}
