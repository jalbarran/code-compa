package server

import (
	"context"
	"errors"
	"strings"
	"sync"
	"time"

	"connectrpc.com/connect"

	v1 "github.com/jalbarran/code-compa/packages/bridge-go/pkg/api/v1/proto/codecompa/v1"
	"github.com/jalbarran/code-compa/packages/bridge-go/pkg/api/v1/proto/codecompa/v1/apiv1connect"
)

type CompanionServer struct {
	token      string
	eventsChan chan *v1.AgentEvent
	mu         sync.Mutex
	responses  map[string]chan *v1.RespondToInterventionRequest
}

func NewCompanionServer(token string) *CompanionServer {
	return &CompanionServer{
		token:      token,
		eventsChan: make(chan *v1.AgentEvent, 100),
		responses:  make(map[string]chan *v1.RespondToInterventionRequest),
	}
}

func (s *CompanionServer) StreamAgentEvents(
	ctx context.Context,
	req *connect.Request[v1.StreamAgentEventsRequest],
	stream *connect.ServerStream[v1.AgentEvent],
) error {
	for {
		select {
		case <-ctx.Done():
			return ctx.Err()
		case event, ok := <-s.eventsChan:
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

	select {
	case <-ctx.Done():
		return nil, ctx.Err()
	case s.eventsChan <- event:
		// Queued
	default:
		return nil, errors.New("event queue full")
	}

	select {
	case <-ctx.Done():
		return nil, ctx.Err()
	case response := <-respChan:
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

// Make sure CompanionServer implements apiv1connect.CompanionServiceHandler
var _ apiv1connect.CompanionServiceHandler = (*CompanionServer)(nil)
