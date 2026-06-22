package server

import (
	"context"
	"encoding/json"
	"errors"
	"strings"
	"sync"
	"time"

	"connectrpc.com/connect"
	"github.com/google/uuid"

	v1 "github.com/jalbarran/code-compa/packages/bridge-go/pkg/api/v1/proto/codecompa/v1"
	"github.com/jalbarran/code-compa/packages/bridge-go/pkg/api/v1/proto/codecompa/v1/apiv1connect"
)

type ClientConnection struct {
	ID          string
	DeviceName  string
	ConnectedAt int64
	EventsChan  chan *v1.AgentEvent
	CancelCtx   context.CancelFunc
}

type CompanionServer struct {
	token       string
	mu          sync.RWMutex
	connections map[string]*ClientConnection
	responses   map[string]chan *v1.RespondToInterventionRequest
}

func NewCompanionServer(token string) *CompanionServer {
	return &CompanionServer{
		token:       token,
		connections: make(map[string]*ClientConnection),
		responses:   make(map[string]chan *v1.RespondToInterventionRequest),
	}
}

func (s *CompanionServer) StreamAgentEvents(
	ctx context.Context,
	req *connect.Request[v1.StreamAgentEventsRequest],
	stream *connect.ServerStream[v1.AgentEvent],
) error {
	deviceName := req.Msg.DeviceName
	if deviceName == "" {
		deviceName = "Unknown Device"
	}

	cancelCtx, cancel := context.WithCancel(ctx)
	defer cancel()

	connID := "conn-" + uuid.New().String()[:8]
	conn := &ClientConnection{
		ID:          connID,
		DeviceName:  deviceName,
		ConnectedAt: time.Now().Unix(),
		EventsChan:  make(chan *v1.AgentEvent, 100),
		CancelCtx:   cancel,
	}

	s.mu.Lock()
	s.connections[connID] = conn
	s.mu.Unlock()

	defer func() {
		s.mu.Lock()
		delete(s.connections, connID)
		close(conn.EventsChan)
		s.mu.Unlock()
	}()

	for {
		select {
		case <-cancelCtx.Done():
			return cancelCtx.Err()
		case event, ok := <-conn.EventsChan:
			if !ok {
				return nil
			}
			if err := stream.Send(event); err != nil {
				return err
			}
		}
	}
}

func (s *CompanionServer) RespondToIntervention(
	ctx context.Context,
	req *connect.Request[v1.RespondToInterventionRequest],
) (*connect.Response[v1.RespondToInterventionResponse], error) {
	s.mu.Lock()
	respChan, exists := s.responses[req.Msg.EventId]
	s.mu.Unlock()

	if !exists {
		return nil, connect.NewError(connect.CodeNotFound, errors.New("intervention event not found or already handled"))
	}

	select {
	case <-ctx.Done():
		return nil, ctx.Err()
	case respChan <- req.Msg:
		// Sent successfully
	case <-time.After(5 * time.Second):
		return nil, connect.NewError(connect.CodeDeadlineExceeded, errors.New("timeout sending response to agent"))
	}

	return connect.NewResponse(&v1.RespondToInterventionResponse{Success: true}), nil
}

func (s *CompanionServer) RequestIntervention(
	ctx context.Context,
	req *connect.Request[v1.RequestInterventionRequest],
) (*connect.Response[v1.RequestInterventionResponse], error) {
	s.mu.RLock()
	streams := len(s.connections)
	s.mu.RUnlock()

	if streams == 0 {
		return nil, connect.NewError(connect.CodeFailedPrecondition, errors.New("no companion device connected"))
	}

	eventID := "evt-" + uuid.New().String()[:8]
	event := &v1.AgentEvent{
		EventId:  eventID,
		Type:     req.Msg.Type,
		Metadata: req.Msg.Metadata,
		Payload:  req.Msg.Payload,
	}

	response, err := s.QueueEvent(ctx, event)
	if err != nil {
		return nil, connect.NewError(connect.CodeInternal, err)
	}

	return connect.NewResponse(&v1.RequestInterventionResponse{
		SelectedOptionId: response.SelectedOptionId,
		FeedbackText:     response.FeedbackText,
	}), nil
}

func (s *CompanionServer) PostTelemetryEvent(
	ctx context.Context,
	req *connect.Request[v1.PostTelemetryEventRequest],
) (*connect.Response[v1.PostTelemetryEventResponse], error) {
	eventID := "tel-" + uuid.New().String()[:8]

	payload := &v1.AgentPayload{
		Title:       req.Msg.Title,
		Description: req.Msg.Description,
	}

	if req.Msg.PayloadJson != "" {
		var extra map[string]interface{}
		if err := json.Unmarshal([]byte(req.Msg.PayloadJson), &extra); err == nil {
			if cmd, ok := extra["command"].(string); ok {
				payload.Command = cmd
			}
			if dir, ok := extra["directory"].(string); ok {
				payload.Directory = dir
			}
			if diff, ok := extra["diff"].(string); ok {
				payload.Diff = diff
			}
			if prompt, ok := extra["prompt"].(string); ok {
				payload.Prompt = prompt
			}
			if risk, ok := extra["riskLevel"].(string); ok {
				payload.RiskLevel = risk
			}
			if out, ok := extra["command_output"].(string); ok {
				payload.CommandOutput = out
			}
		}
	}

	event := &v1.AgentEvent{
		EventId:  eventID,
		Type:     req.Msg.Type,
		Metadata: req.Msg.Metadata,
		Payload:  payload,
	}

	s.mu.RLock()
	for _, conn := range s.connections {
		select {
		case conn.EventsChan <- event:
		default:
		}
	}
	s.mu.RUnlock()

	return connect.NewResponse(&v1.PostTelemetryEventResponse{Success: true}), nil
}

func (s *CompanionServer) ListConnections(
	ctx context.Context,
	req *connect.Request[v1.ListConnectionsRequest],
) (*connect.Response[v1.ListConnectionsResponse], error) {
	s.mu.RLock()
	defer s.mu.RUnlock()

	var list []*v1.ConnectionInfo
	for _, conn := range s.connections {
		list = append(list, &v1.ConnectionInfo{
			Id:          conn.ID,
			DeviceName:  conn.DeviceName,
			ConnectedAt: conn.ConnectedAt,
		})
	}

	return connect.NewResponse(&v1.ListConnectionsResponse{Connections: list}), nil
}

func (s *CompanionServer) DisconnectConnection(
	ctx context.Context,
	req *connect.Request[v1.DisconnectConnectionRequest],
) (*connect.Response[v1.DisconnectConnectionResponse], error) {
	s.mu.Lock()
	conn, exists := s.connections[req.Msg.Id]
	s.mu.Unlock()

	if !exists {
		return connect.NewResponse(&v1.DisconnectConnectionResponse{Success: false}), nil
	}

	conn.CancelCtx()

	return connect.NewResponse(&v1.DisconnectConnectionResponse{Success: true}), nil
}

// QueueEvent adds an event to be streamed to the mobile client and waits for approval.
func (s *CompanionServer) QueueEvent(ctx context.Context, event *v1.AgentEvent) (*v1.RespondToInterventionRequest, error) {
	respChan := make(chan *v1.RespondToInterventionRequest, 1)

	s.mu.Lock()
	s.responses[event.EventId] = respChan
	s.mu.Unlock()

	defer func() {
		s.mu.Lock()
		delete(s.responses, event.EventId)
		s.mu.Unlock()
	}()

	s.mu.RLock()
	for _, conn := range s.connections {
		select {
		case conn.EventsChan <- event:
		default:
		}
	}
	s.mu.RUnlock()

	select {
	case <-ctx.Done():
		return nil, ctx.Err()
	case response := <-respChan:
		// Broadcast resolution to other devices to dismiss the HITL card
		s.mu.RLock()
		for _, conn := range s.connections {
			dismissEvent := &v1.AgentEvent{
				EventId:  event.EventId,
				Type:     "INTERVENTION_RESOLVED",
				Metadata: event.Metadata,
				Payload: &v1.AgentPayload{
					Title:       "Resolved",
					Description: "This intervention has been resolved on another device.",
				},
			}
			select {
			case conn.EventsChan <- dismissEvent:
			default:
			}
		}
		s.mu.RUnlock()
		return response, nil
	}
}

// Auth Interceptor

type authInterceptor struct {
	token string
}

func NewAuthInterceptor(token string) connect.Interceptor {
	return &authInterceptor{token: token}
}

func (i *authInterceptor) WrapUnary(next connect.UnaryFunc) connect.UnaryFunc {
	return func(ctx context.Context, req connect.AnyRequest) (connect.AnyResponse, error) {
		if !i.validate(req.Header().Get("Authorization")) {
			return nil, connect.NewError(connect.CodeUnauthenticated, errors.New("unauthorized: invalid or missing bearer token"))
		}
		return next(ctx, req)
	}
}

func (i *authInterceptor) WrapStreamingHandler(next connect.StreamingHandlerFunc) connect.StreamingHandlerFunc {
	return func(ctx context.Context, conn connect.StreamingHandlerConn) error {
		if !i.validate(conn.RequestHeader().Get("Authorization")) {
			return connect.NewError(connect.CodeUnauthenticated, errors.New("unauthorized: invalid or missing bearer token"))
		}
		return next(ctx, conn)
	}
}

func (i *authInterceptor) WrapStreamingClient(next connect.StreamingClientFunc) connect.StreamingClientFunc {
	return next
}

func (i *authInterceptor) validate(authHeader string) bool {
	if authHeader == "" {
		return false
	}
	parts := strings.Split(authHeader, " ")
	if len(parts) != 2 || strings.ToLower(parts[0]) != "bearer" {
		return false
	}
	return parts[1] == i.token
}

var _ apiv1connect.CompanionServiceHandler = (*CompanionServer)(nil)
