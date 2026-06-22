# Spec 12: Multiple Device Connections & Revocation

This spec defines the behavior, protocol updates, user flow, and implementation strategy for supporting multiple concurrent companion app connections to the Code Compa Go sidecar server.

## 1. Goal & Requirements

- **Concurrent Streams**: The Go sidecar server must support multiple active clients (mobile devices or web tabs) streaming events concurrently without competing for event consumption (i.e. broadcasting events to all clients).
- **Client Identification**: Every companion app client can configure a custom "Device Name" in its settings. This name must be transmitted to the bridge Go sidecar during the connection handshake.
- **Connection Management (UI)**:
  - The companion app must list all currently active connections.
  - A user must be able to disconnect (revoke) any active connection directly from the mobile/web UI.
- **Conflict Resolution**: If one client responds to a pending HITL intervention request (e.g. Approve/Reject), all other connected clients must be notified of the decision and the event must be cleared from their queues.

---

## 2. Protocol Changes (`.proto`)

### 2.1. Stream Registration

Add a `device_name` field to `StreamAgentEventsRequest` to identify the client:

```protobuf
message StreamAgentEventsRequest {
  string device_name = 1; // e.g. "iPhone 15 Pro", "Chrome Web Tab"
}
```

### 2.2. Connection Administration

Add two new RPC methods to `CompanionService` to manage active connections:

```protobuf
service CompanionService {
  ...
  // List all active companion connections
  rpc ListConnections(ListConnectionsRequest) returns (ListConnectionsResponse);

  // Remotely terminate a companion connection by ID
  rpc DisconnectConnection(DisconnectConnectionRequest) returns (DisconnectConnectionResponse);
}

message ListConnectionsRequest {}

message ListConnectionsResponse {
  repeated ConnectionInfo connections = 1;
}

message ConnectionInfo {
  string id = 1;
  string device_name = 2;
  int64 connected_at = 3; // Unix timestamp in seconds
}

message DisconnectConnectionRequest {
  string id = 1;
}

message DisconnectConnectionResponse {
  bool success = 1;
}
```

---

## 3. Go Sidecar Architecture (Pub/Sub Broadcast)

### 3.1. Connection Registry

Implement a thread-safe registry in `internal/server/server.go` to keep track of active streams:

```go
type ClientConnection struct {
	ID          string
	DeviceName  string
	ConnectedAt int64
	EventsChan  chan *v1.AgentEvent
	CancelCtx   context.CancelFunc
}

type CompanionServer struct {
	...
	mu          sync.RWMutex
	connections map[string]*ClientConnection
}
```

### 3.2. Broadcaster Loop

- When `StreamAgentEvents` is called:
  - Generate a unique `connectionID` (e.g. `conn-uuid`).
  - Create a buffered event channel `EventsChan`.
  - Register the `ClientConnection` in the `connections` map.
  - Start a loop sending events from `EventsChan` to the server stream.
  - Defer cleanup: unregister the connection, close the channel, and clean up.

- When `PostTelemetryEvent` or `RequestIntervention` is invoked:
  - Read from the `connections` map under a read lock.
  - Broadcast the event by writing it to the `EventsChan` of every registered connection.

### 3.3. Response Cancellation / Notification

When a client responds to an intervention using `RespondToIntervention`:
- Notify all other active connections to dismiss/remove the event. We can send a cancellation event (e.g., `event.type = "INTERVENTION_RESOLVED"`) down the telemetry streams.

---

## 4. Mobile & Web App Changes

### 4.1. Settings Screen

- **Device Name Input**: Add a text input field in settings to customize the device name. Store this value in Zustand and local storage (default to device model or OS name if empty).
- **Active Connections Panel**: Fetch active connections from `ListConnections` and render them in a list showing:
  - Device Name.
  - Active duration (calculated from `connected_at`).
  - A "Revoke/Disconnect" button next to other devices.
- **Connection Revocation**: Clicking "Revoke" calls the `DisconnectConnection` RPC for the target ID.

### 4.2. State Management (Zustand)

Update `useConnectionStore.ts` to:
- Pass the stored `deviceName` when calling `streamAgentEvents`.
- Poll `ListConnections` or listen for stream connection list updates to keep the active connections UI fresh.

---

## 5. Verification & Success Criteria

1. **Broadcasting Test**:
   - Connect two tabs to the sidecar.
   - Send a telemetry notification via `notify_agent_step`.
   - Verify that **both** tabs display the log item simultaneously.
2. **Device Naming Test**:
   - Change the name to "Testing Device X" in Settings.
   - Verify that the active connections list shows "Testing Device X".
3. **Revocation Test**:
   - Click "Revoke" on another connected device.
   - Verify that the target device is disconnected instantly and redirected to the login/pairing screen.
