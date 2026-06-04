package lockfile

import (
	"os"
	"testing"
)

func TestLockfileLifecycle(t *testing.T) {
	workspace := "/tmp/test-workspace"
	lockPath := GetLockfilePath(workspace)

	// Cleanup first
	_ = os.Remove(lockPath)
	defer os.Remove(lockPath)

	// Acquire lock
	port, acquired, err := CheckAndAcquire(workspace, 9999, "test-token")
	if err != nil {
		t.Fatalf("Expected no error, got %v", err)
	}
	if !acquired {
		t.Fatalf("Expected lock to be acquired")
	}
	if port != 9999 {
		t.Fatalf("Expected port 9999, got %d", port)
	}

	// Verify lockfile exists
	if _, err := os.Stat(lockPath); os.IsNotExist(err) {
		t.Fatalf("Expected lockfile to exist")
	}

	// Try acquiring again in the same workspace (same PID)
	port2, acquired2, err := CheckAndAcquire(workspace, 8888, "other-token")
	if err != nil {
		t.Fatalf("Expected no error, got %v", err)
	}
	// Since os.Getpid() is running and is alive, it should return acquired = false, and the original port (9999)
	if acquired2 {
		t.Fatalf("Expected lock NOT to be acquired again")
	}
	if port2 != 9999 {
		t.Fatalf("Expected already allocated port 9999, got %d", port2)
	}
}

func TestStaleLockfile(t *testing.T) {
	workspace := "/tmp/test-workspace-stale"
	lockPath := GetLockfilePath(workspace)

	_ = os.Remove(lockPath)
	defer os.Remove(lockPath)

	// Write lockfile with a fake dead PID (e.g. 99999)
	err := WriteLockfile(lockPath, 99999, 8765, "stale-token")
	if err != nil {
		t.Fatalf("Failed to write lockfile: %v", err)
	}

	// Acquire lock
	port, acquired, err := CheckAndAcquire(workspace, 9999, "fresh-token")
	if err != nil {
		t.Fatalf("Expected no error, got %v", err)
	}
	// Since 99999 is highly unlikely to be running, it should override and acquire
	if !acquired {
		t.Fatalf("Expected lock to override stale lock and be acquired")
	}
	if port != 9999 {
		t.Fatalf("Expected port 9999, got %d", port)
	}
}
