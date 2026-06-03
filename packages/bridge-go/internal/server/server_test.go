package server

import (
	"context"
	"net/http"
	"net/http/httptest"
	"testing"

	"connectrpc.com/connect"

	v1 "github.com/jalbarran/code-compa/packages/bridge-go/pkg/api/v1/proto/codecompa/v1"
	"github.com/jalbarran/code-compa/packages/bridge-go/pkg/api/v1/proto/codecompa/v1/apiv1connect"
)

func TestAuthInterceptor(t *testing.T) {
	token := "secure-test-token"
	companionServer := NewCompanionServer(token)
	_, handler := apiv1connect.NewCompanionServiceHandler(
		companionServer,
		connect.WithInterceptors(NewAuthInterceptor(token)),
	)

	srv := httptest.NewServer(handler)
	defer srv.Close()

	client := apiv1connect.NewCompanionServiceClient(
		http.DefaultClient,
		srv.URL,
	)

	ctx := context.Background()

	// 1. Test without Authorization header (should fail)
	_, err := client.RespondToIntervention(ctx, connect.NewRequest(&v1.RespondToInterventionRequest{
		EventId: "test-event",
	}))
	if err == nil {
		t.Fatalf("Expected error due to missing token, got nil")
	}
	connectErr, ok := err.(*connect.Error)
	if !ok {
		t.Fatalf("Expected connect.Error, got %T", err)
	}
	if connectErr.Code() != connect.CodeUnauthenticated {
		t.Fatalf("Expected Unauthenticated code, got %v", connectErr.Code())
	}

	// 2. Test with invalid token (should fail)
	badReq := connect.NewRequest(&v1.RespondToInterventionRequest{
		EventId: "test-event",
	})
	badReq.Header().Set("Authorization", "Bearer invalid-token")
	_, err = client.RespondToIntervention(ctx, badReq)
	if err == nil {
		t.Fatalf("Expected error due to invalid token, got nil")
	}

	// 3. Test with correct token (should fail with NotFound instead of Unauthenticated, since event does not exist in queue)
	goodReq := connect.NewRequest(&v1.RespondToInterventionRequest{
		EventId: "test-event",
	})
	goodReq.Header().Set("Authorization", "Bearer "+token)
	_, err = client.RespondToIntervention(ctx, goodReq)
	if err == nil {
		t.Fatalf("Expected NotFound error, got nil")
	}
	connectErr2, ok := err.(*connect.Error)
	if !ok {
		t.Fatalf("Expected connect.Error, got %T", err)
	}
	if connectErr2.Code() != connect.CodeNotFound {
		t.Fatalf("Expected NotFound code (which implies authorization succeeded), got %v", connectErr2.Code())
	}
}
